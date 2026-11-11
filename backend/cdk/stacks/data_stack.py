"""Storage for ExpenseTrack Pro: one DynamoDB table, one S3 bucket.

Schema v2 (the full key design is in backend/api/keys.py and
docs/data-model.md): data belongs to a *ledger* (household), so a family
can share one. Two overloaded secondary indexes cover every other read:

  GSI1  lookups   USER#<sub> -> their ledgers, INVITE#<email> -> invites,
                  LEDGERS -> every ledger (jobs), DUE#<month> -> recurring
                  rules by due date, LEDGER#<lid>#SPLIT -> split expenses
  GSI2  by date   LEDGER#<lid>#EXP / #SAVE -> expenses / savings in date order

The v1 table (per-user partitions, no indexes) is kept, read-only and
retained, until the v2 migration has been verified in every stage; the
migration itself runs automatically after deploy (see api_stack.py).
"""
import aws_cdk as cdk
from aws_cdk import aws_dynamodb as dynamodb
from aws_cdk import aws_s3 as s3
from constructs import Construct

from .site_config import SiteConfig


class DataStack(cdk.Stack):
    def __init__(self, scope: Construct, construct_id: str, *, stage: str, site: SiteConfig, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        removal_policy = cdk.RemovalPolicy.DESTROY if stage != "prod" else cdk.RemovalPolicy.RETAIN

        # v1 table — no longer written to. Kept (and retained even outside
        # prod) as the migration's source and the rollback path; remove it
        # in a later release once v2 is confirmed in every stage.
        self.legacy_table = dynamodb.TableV2(
            self,
            "Table",
            table_name=f"expense-track-pro-{stage}",
            partition_key=dynamodb.Attribute(name="PK", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="SK", type=dynamodb.AttributeType.STRING),
            billing=dynamodb.Billing.on_demand(),
            point_in_time_recovery=(stage == "prod"),
            removal_policy=cdk.RemovalPolicy.RETAIN,
            time_to_live_attribute="ttl",
        )

        string = dynamodb.AttributeType.STRING
        self.table = dynamodb.TableV2(
            self,
            "LedgerTable",
            table_name=f"expense-track-pro-v2-{stage}",
            partition_key=dynamodb.Attribute(name="PK", type=string),
            sort_key=dynamodb.Attribute(name="SK", type=string),
            global_secondary_indexes=[
                dynamodb.GlobalSecondaryIndexPropsV2(
                    index_name="GSI1",
                    partition_key=dynamodb.Attribute(name="GSI1PK", type=string),
                    sort_key=dynamodb.Attribute(name="GSI1SK", type=string),
                ),
                dynamodb.GlobalSecondaryIndexPropsV2(
                    index_name="GSI2",
                    partition_key=dynamodb.Attribute(name="GSI2PK", type=string),
                    sort_key=dynamodb.Attribute(name="GSI2SK", type=string),
                ),
            ],
            billing=dynamodb.Billing.on_demand(),  # pay-per-request: scales to zero, no capacity to size
            # Point-in-time recovery everywhere: 35 days of restore points
            # for a few cents, worth it for household money data.
            point_in_time_recovery=True,
            deletion_protection=(stage == "prod"),
            removal_policy=removal_policy,
            # Invites, link codes, outbox emails and "already notified"
            # markers expire on their own.
            time_to_live_attribute="ttl",
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
                    allowed_origins=site.origins,
                    allowed_headers=["*"],
                    max_age=3000,
                )
            ],
            removal_policy=removal_policy,
            auto_delete_objects=(stage != "prod"),
        )

        cdk.CfnOutput(self, "TableName", value=self.table.table_name)
        cdk.CfnOutput(self, "LegacyTableName", value=self.legacy_table.table_name)
        cdk.CfnOutput(self, "ReceiptsBucketName", value=self.receipts_bucket.bucket_name)
