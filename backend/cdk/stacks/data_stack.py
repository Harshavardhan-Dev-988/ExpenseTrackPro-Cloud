"""Storage for ExpenseTrack Pro: one DynamoDB table, one S3 bucket.

Table design (single-table, per Section 5 of the roadmap doc):
  PK = "USER#<userId>"          SK = "SETTINGS"              -> a user's settings
  PK = "USER#<userId>"          SK = "EXPENSE#<expenseId>"   -> one expense
  PK = "USER#<userId>"          SK = "SAVINGS_ENTRY#<id>"    -> one savings entry
  PK = "USER#<userId>"          SK = "SAVINGS_GOAL#<id>"     -> one savings goal
  PK = "WHATSAPP#<e164number>"  SK = "LINK"                  -> {userId} (phase 4:
                                                                 looks up who a text
                                                                 came from, no GSI needed)

Every query the app makes is "give me one partition" (a user's items, or one
phone number's link), so no secondary indexes are needed yet — see the
roadmap's "Data model & migration" section for why DynamoDB was chosen over a
relational database.
"""
import aws_cdk as cdk
from aws_cdk import aws_dynamodb as dynamodb
from aws_cdk import aws_s3 as s3
from constructs import Construct


class DataStack(cdk.Stack):
    def __init__(self, scope: Construct, construct_id: str, *, stage: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        removal_policy = cdk.RemovalPolicy.DESTROY if stage != "prod" else cdk.RemovalPolicy.RETAIN

        self.table = dynamodb.TableV2(
            self,
            "Table",
            table_name=f"expense-track-pro-{stage}",
            partition_key=dynamodb.Attribute(name="PK", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="SK", type=dynamodb.AttributeType.STRING),
            billing=dynamodb.Billing.on_demand(),  # pay-per-request: scales to zero, no capacity to size
            point_in_time_recovery=(stage == "prod"),
            removal_policy=removal_policy,
        )

        # Receipt photos, attached to an expense via its `receiptUrl` field.
        # Private bucket — the API hands out short-lived presigned URLs for
        # upload/download rather than making objects public (wired up in the
        # "Hardening" phase; the bucket itself is ready now).
        self.receipts_bucket = s3.Bucket(
            self,
            "ReceiptsBucket",
            bucket_name=f"expense-track-pro-receipts-{stage}-{cdk.Aws.ACCOUNT_ID}",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            encryption=s3.BucketEncryption.S3_MANAGED,
            cors=[
                s3.CorsRule(
                    allowed_methods=[s3.HttpMethods.PUT, s3.HttpMethods.GET],
                    allowed_origins=["http://localhost:5173", "http://localhost:5193"],
                    allowed_headers=["*"],
                    max_age=3000,
                )
            ],
            removal_policy=removal_policy,
            auto_delete_objects=(stage != "prod"),
        )

        cdk.CfnOutput(self, "TableName", value=self.table.table_name)
        cdk.CfnOutput(self, "ReceiptsBucketName", value=self.receipts_bucket.bucket_name)
