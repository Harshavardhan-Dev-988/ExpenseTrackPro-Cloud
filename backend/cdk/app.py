#!/usr/bin/env python3
"""CDK entrypoint for ExpenseTrack Pro's cloud backend.

Deploys three stacks, in dependency order:
  1. AuthStack  - Cognito User Pool (sign-in/sign-up, social login added in phase 3)
  2. DataStack  - the single DynamoDB table + the S3 receipts bucket
  3. ApiStack   - the FastAPI Lambda + HTTP API, wired to both of the above

See ../README.md for setup and deploy instructions.
"""
import os

import aws_cdk as cdk

from stacks.auth_stack import AuthStack
from stacks.data_stack import DataStack
from stacks.api_stack import ApiStack

app = cdk.App()

# One environment for now: change APP_STAGE to deploy a separate "dev"/"prod"
# copy of the whole stack (each gets its own Cognito pool, table and API).
stage = app.node.try_get_context("stage") or os.environ.get("APP_STAGE", "dev")

env = cdk.Environment(
    account=os.environ.get("CDK_DEFAULT_ACCOUNT"),
    region=os.environ.get("CDK_DEFAULT_REGION", "ap-south-1"),
)

auth_stack = AuthStack(app, f"ExpenseTrack-Auth-{stage}", stage=stage, env=env)
data_stack = DataStack(app, f"ExpenseTrack-Data-{stage}", stage=stage, env=env)
api_stack = ApiStack(
    app,
    f"ExpenseTrack-Api-{stage}",
    stage=stage,
    user_pool=auth_stack.user_pool,
    user_pool_client=auth_stack.user_pool_client,
    table=data_stack.table,
    receipts_bucket=data_stack.receipts_bucket,
    env=env,
)
api_stack.add_dependency(auth_stack)
api_stack.add_dependency(data_stack)

for stack in (auth_stack, data_stack, api_stack):
    cdk.Tags.of(stack).add("project", "expense-track-pro")
    cdk.Tags.of(stack).add("stage", stage)

app.synth()
