"""The API: one Lambda running the FastAPI app (via Mangum), fronted by an
HTTP API whose built-in Cognito authorizer checks every request's JWT before
it ever reaches the Lambda — so no route in the FastAPI app has to verify
auth itself; it just trusts the `userId` the authorizer attaches to the
request (see api/dependencies/auth.py).

Alongside it:
  * a jobs Lambda (same code, jobs_handler.py) run by EventBridge schedules
    for recurring expenses, budget alerts and monthly summary emails;
  * a migration Lambda (migrate_handler.py) that a CDK Trigger runs after
    every deploy, applying any new data migration exactly once.
"""
import os

import aws_cdk as cdk
from aws_cdk import aws_apigatewayv2 as apigwv2
from aws_cdk import aws_apigatewayv2_authorizers as apigwv2_authorizers
from aws_cdk import aws_apigatewayv2_integrations as apigwv2_integrations
from aws_cdk import aws_cognito as cognito
from aws_cdk import aws_dynamodb as dynamodb
from aws_cdk import aws_events as events
from aws_cdk import aws_events_targets as targets
from aws_cdk import aws_iam as iam
from aws_cdk import aws_lambda as _lambda
from aws_cdk import aws_s3 as s3
from aws_cdk import triggers
from constructs import Construct

from .local_bundling import LocalApiBundling
from .site_config import SiteConfig

API_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "api")

# Twilio Auth Token, read from Secrets Manager via a CloudFormation dynamic
# reference (never plaintext in this template or in git) - same pattern as
# the Google OAuth client secret in auth_stack.py. `unsafe_unwrap()` is safe
# here specifically because Lambda environment variable VALUES are a
# documented dynamic-reference target: CloudFormation resolves the token at
# deploy time, so the actual secret still never appears in the synthesized
# template, only `{{resolve:secretsmanager:...}}`.
TWILIO_AUTH_TOKEN_SECRET_NAME = "expense-track-pro/twilio-auth-token"
# This account's Twilio trial WhatsApp sender number (Twilio's newer "Try
# out WhatsApp" trial flow gives each account its own dedicated trial
# number, rather than the older shared sandbox number) - shown to the user
# in the app's "Link WhatsApp" UI as the number to text. Update this if the
# project ever moves to a different sender (a new trial number, or a real
# business-verified one).
TWILIO_WHATSAPP_NUMBER = "+17372508034"

# Email (SES). Off until the app has its own domain: the jobs then write
# each email to the household's OUTBOX for preview instead of sending.
# To switch on: verify the domain in SES (and leave the SES sandbox), then
# set both in cdk.json context ("emailFrom": "ExpenseTrack Pro
# <hello@example.com>", "emailEnabled": true) and redeploy this stack.


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
        legacy_table: dynamodb.TableV2,
        receipts_bucket: s3.Bucket,
        site: SiteConfig,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        code = _lambda.Code.from_asset(
            API_DIR,
            bundling=cdk.BundlingOptions(
                # `image` is required by the type but is only reached if
                # `local.try_bundle` returns False — it never is here.
                image=_lambda.Runtime.PYTHON_3_12.bundling_image,
                local=LocalApiBundling(API_DIR),
            ),
        )
        email_from = self.node.try_get_context("emailFrom") or ""
        email_enabled = bool(self.node.try_get_context("emailEnabled")) and bool(email_from)
        app_url = site.custom_origin or "https://d3bttra9tv41h7.cloudfront.net"
        shared_env = {
            "TABLE_NAME": table.table_name,
            "STAGE": stage,
            "APP_URL": app_url,
            "EMAIL_ENABLED": "true" if email_enabled else "false",
            "EMAIL_FROM": email_from,
        }

        fn = _lambda.Function(
            self,
            "ApiFunction",
            runtime=_lambda.Runtime.PYTHON_3_12,
            architecture=_lambda.Architecture.X86_64,
            handler="lambda_handler.handler",
            code=code,
            timeout=cdk.Duration.seconds(15),
            memory_size=256,
            environment={
                **shared_env,
                "RECEIPTS_BUCKET_NAME": receipts_bucket.bucket_name,
                "TWILIO_AUTH_TOKEN": cdk.SecretValue.secrets_manager(
                    TWILIO_AUTH_TOKEN_SECRET_NAME
                ).unsafe_unwrap(),
                "TWILIO_WHATSAPP_NUMBER": TWILIO_WHATSAPP_NUMBER,
                # Read by api/main.py's CORSMiddleware (same list as the HTTP API's CORS).
                "APP_ORIGINS": ",".join(site.origins),
            },
        )
        table.grant_read_write_data(fn)
        receipts_bucket.grant_read_write(fn)

        # ---- scheduled jobs --------------------------------------------------
        jobs_fn = _lambda.Function(
            self,
            "JobsFunction",
            runtime=_lambda.Runtime.PYTHON_3_12,
            architecture=_lambda.Architecture.X86_64,
            handler="jobs_handler.handler",
            code=code,
            timeout=cdk.Duration.minutes(5),
            memory_size=256,
            environment=shared_env,
        )
        table.grant_read_write_data(jobs_fn)
        jobs_fn.add_to_role_policy(
            iam.PolicyStatement(actions=["ses:SendEmail"], resources=["*"])
        )
        # Times are UTC; comments give India time (UTC+5:30).
        for job, schedule, label in (
            ("recurring", events.Schedule.cron(minute="0", hour="19"), "00:30 IST daily"),
            ("budget_alerts", events.Schedule.cron(minute="30", hour="14"), "20:00 IST daily"),
            ("monthly_summary", events.Schedule.cron(minute="30", hour="3", day="1"), "09:00 IST on the 1st"),
        ):
            events.Rule(
                self,
                f"Job-{job}",
                description=f"ExpenseTrack Pro {job} job ({label})",
                schedule=schedule,
                targets=[targets.LambdaFunction(jobs_fn, event=events.RuleTargetInput.from_object({"job": job}),
                                                retry_attempts=2)],
            )

        # ---- data migrations ---------------------------------------------------
        # Runs migrations/ after each deploy; each one applies once per table.
        migrate_fn = triggers.TriggerFunction(
            self,
            "MigrateFunction",
            runtime=_lambda.Runtime.PYTHON_3_12,
            architecture=_lambda.Architecture.X86_64,
            handler="migrate_handler.handler",
            code=code,
            timeout=cdk.Duration.minutes(15),
            memory_size=512,
            environment={**shared_env, "LEGACY_TABLE_NAME": legacy_table.table_name},
            execute_after=[fn],
            execute_on_handler_change=True,
        )
        table.grant_read_write_data(migrate_fn)
        legacy_table.grant_read_data(migrate_fn)

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
                allow_origins=site.origins,
                allow_methods=[
                    apigwv2.CorsHttpMethod.GET,
                    apigwv2.CorsHttpMethod.POST,
                    apigwv2.CorsHttpMethod.PUT,
                    apigwv2.CorsHttpMethod.DELETE,
                    apigwv2.CorsHttpMethod.OPTIONS,
                ],
                allow_headers=["Authorization", "Content-Type", "X-Ledger-Id"],
            ),
            default_authorizer=authorizer,
        )

        # Explicit methods (not ANY) so OPTIONS is left unmatched here and
        # falls through to API Gateway's own built-in CORS preflight
        # responder. ANY would swallow OPTIONS into this route too, sending
        # preflight requests through the Cognito authorizer and failing them
        # with 401 - breaking every real cross-origin PUT/DELETE/Authorization
        # request from the browser.
        http_api.add_routes(
            path="/{proxy+}",
            methods=[
                apigwv2.HttpMethod.GET,
                apigwv2.HttpMethod.POST,
                apigwv2.HttpMethod.PUT,
                apigwv2.HttpMethod.DELETE,
                apigwv2.HttpMethod.PATCH,
            ],
            integration=apigwv2_integrations.HttpLambdaIntegration("ApiIntegration", fn),
        )

        # Health check stays open (no auth) so uptime monitoring doesn't need
        # a token — the FastAPI app itself still enforces auth on every other
        # route.
        http_api.add_routes(
            path="/health",
            methods=[apigwv2.HttpMethod.GET],
            integration=apigwv2_integrations.HttpLambdaIntegration("HealthIntegration", fn),
            authorizer=apigwv2.HttpNoneAuthorizer(),
        )

        # Twilio calls this directly and can't send a Cognito JWT, so it
        # can't sit behind the default authorizer either - this literal
        # route is matched ahead of the /{proxy+} catch-all (API Gateway
        # prefers the more specific path), same as /health above. The
        # router itself (routers/whatsapp.py) verifies every request's
        # X-Twilio-Signature before trusting anything in the body.
        http_api.add_routes(
            path="/whatsapp/webhook",
            methods=[apigwv2.HttpMethod.POST],
            integration=apigwv2_integrations.HttpLambdaIntegration("WhatsAppWebhookIntegration", fn),
            authorizer=apigwv2.HttpNoneAuthorizer(),
        )

        self.api_url = http_api.api_endpoint
        self.fn = fn
        self.jobs_fn = jobs_fn
        self.http_api = http_api
        cdk.CfnOutput(self, "ApiUrl", value=http_api.api_endpoint)
