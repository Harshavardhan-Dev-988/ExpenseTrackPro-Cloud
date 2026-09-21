"""The API: one Lambda running the FastAPI app (via Mangum), fronted by an
HTTP API whose built-in Cognito authorizer checks every request's JWT before
it ever reaches the Lambda — so no route in the FastAPI app has to verify
auth itself; it just trusts the `userId` the authorizer attaches to the
request (see api/dependencies/auth.py).
"""
import os

import aws_cdk as cdk
from aws_cdk import aws_apigatewayv2 as apigwv2
from aws_cdk import aws_apigatewayv2_authorizers as apigwv2_authorizers
from aws_cdk import aws_apigatewayv2_integrations as apigwv2_integrations
from aws_cdk import aws_cognito as cognito
from aws_cdk import aws_dynamodb as dynamodb
from aws_cdk import aws_lambda as _lambda
from aws_cdk import aws_s3 as s3
from aws_cdk.aws_lambda_python_alpha import PythonFunction
from constructs import Construct

API_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "api")


class ApiStack(cdk.Stack):
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        stage: str,
        user_pool: cognito.UserPool,
        user_pool_client: cognito.UserPoolClient,
        table: dynamodb.TableV2,
        receipts_bucket: s3.Bucket,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        fn = PythonFunction(
            self,
            "ApiFunction",
            entry=API_DIR,
            runtime=_lambda.Runtime.PYTHON_3_12,
            index="lambda_handler.py",
            handler="handler",
            timeout=cdk.Duration.seconds(15),
            memory_size=256,
            environment={
                "TABLE_NAME": table.table_name,
                "RECEIPTS_BUCKET_NAME": receipts_bucket.bucket_name,
                "STAGE": stage,
            },
        )
        table.grant_read_write_data(fn)
        receipts_bucket.grant_read_write(fn)

        authorizer = apigwv2_authorizers.HttpUserPoolAuthorizer(
            "CognitoAuthorizer",
            user_pool,
            user_pool_clients=[user_pool_client],
        )

        http_api = apigwv2.HttpApi(
            self,
            "HttpApi",
            api_name=f"expense-track-pro-{stage}",
            cors_preflight=apigwv2.CorsPreflightOptions(
                allow_origins=["http://localhost:5173", "http://localhost:5193"],
                allow_methods=[
                    apigwv2.CorsHttpMethod.GET,
                    apigwv2.CorsHttpMethod.POST,
                    apigwv2.CorsHttpMethod.PUT,
                    apigwv2.CorsHttpMethod.DELETE,
                    apigwv2.CorsHttpMethod.OPTIONS,
                ],
                allow_headers=["Authorization", "Content-Type"],
            ),
            default_authorizer=authorizer,
        )

        http_api.add_routes(
            path="/{proxy+}",
            methods=[apigwv2.HttpMethod.ANY],
            integration=apigwv2_integrations.HttpLambdaIntegration("ApiIntegration", fn),
        )

        # Health check stays open (no auth) so uptime monitoring doesn't need
        # a token — the FastAPI app itself still enforces auth on every other
        # route.
        http_api.add_routes(
            path="/health",
            methods=[apigwv2.HttpMethod.GET],
            integration=apigwv2_integrations.HttpLambdaIntegration("HealthIntegration", fn),
            authorizer=apigwv2_authorizers.HttpNoneAuthorizer(),
        )

        self.api_url = http_api.api_endpoint
        cdk.CfnOutput(self, "ApiUrl", value=http_api.api_endpoint)
