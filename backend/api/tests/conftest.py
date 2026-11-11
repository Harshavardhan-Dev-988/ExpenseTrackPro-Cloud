"""Test setup: a moto-mocked DynamoDB with the v2 table (and the v1 table
for migration tests), and a FastAPI TestClient. Users are simulated with
the local-development headers (X-Local-User-Id / -Email / -Name)."""
import os
import sys

import pytest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

os.environ.update(
    AWS_ACCESS_KEY_ID="test", AWS_SECRET_ACCESS_KEY="test", AWS_DEFAULT_REGION="ap-southeast-2",
    TABLE_NAME="etp-v2", LEGACY_TABLE_NAME="etp-v1", STAGE="test", RECEIPTS_BUCKET_NAME="receipts-test",
)

from moto import mock_aws  # noqa: E402


def create_tables():
    import boto3

    ddb = boto3.client("dynamodb")
    attrs = [{"AttributeName": n, "AttributeType": "S"} for n in ("PK", "SK", "GSI1PK", "GSI1SK", "GSI2PK", "GSI2SK")]
    gsis = [
        {"IndexName": name, "KeySchema": [{"AttributeName": f"{name}PK", "KeyType": "HASH"},
                                          {"AttributeName": f"{name}SK", "KeyType": "RANGE"}],
         "Projection": {"ProjectionType": "ALL"}}
        for name in ("GSI1", "GSI2")
    ]
    ddb.create_table(TableName="etp-v2", BillingMode="PAY_PER_REQUEST", AttributeDefinitions=attrs,
                     KeySchema=[{"AttributeName": "PK", "KeyType": "HASH"}, {"AttributeName": "SK", "KeyType": "RANGE"}],
                     GlobalSecondaryIndexes=gsis)
    ddb.create_table(TableName="etp-v1", BillingMode="PAY_PER_REQUEST", AttributeDefinitions=attrs[:2],
                     KeySchema=[{"AttributeName": "PK", "KeyType": "HASH"}, {"AttributeName": "SK", "KeyType": "RANGE"}])


@pytest.fixture()
def aws():
    with mock_aws():
        import db

        db.reset()
        create_tables()
        yield
        db.reset()


@pytest.fixture()
def client(aws):
    from fastapi.testclient import TestClient

    from main import app

    return TestClient(app)


def user(uid, email=None, name=None, ledger=None):
    h = {"X-Local-User-Id": uid}
    if email:
        h["X-Local-User-Email"] = email
    if name:
        h["X-Local-User-Name"] = name
    if ledger:
        h["X-Ledger-Id"] = ledger
    return h


@pytest.fixture()
def priya():
    return user("priya", "priya@example.com", "Priya Sharma")


@pytest.fixture()
def raj():
    return user("raj", "raj@example.com", "Raj Sharma")


def with_ledger(headers, ledger_id):
    return {**headers, "X-Ledger-Id": ledger_id}


def expense(**kw):
    base = {"date": "2026-11-05T10:00:00+05:30", "amount": 450, "category": "dine_out", "description": "Dinner"}
    return {**base, **kw}
