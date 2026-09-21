"""Thin DynamoDB helpers over the single table (see cdk/stacks/data_stack.py
for the key design). Every function here takes and returns plain dicts —
the routers are responsible for turning those into/out of Pydantic models.
"""
import json
import os
from decimal import Decimal
from typing import Any, Dict, List, Optional

import boto3
from boto3.dynamodb.conditions import Key

_table = None


def table():
    """Lazily creates the boto3 Table resource (so importing this module
    doesn't require AWS credentials — useful for local unit tests)."""
    global _table
    if _table is None:
        table_name = os.environ["TABLE_NAME"]
        _table = boto3.resource("dynamodb").Table(table_name)
    return _table


def user_pk(user_id: str) -> str:
    return f"USER#{user_id}"


def get_item(pk: str, sk: str) -> Optional[Dict[str, Any]]:
    resp = table().get_item(Key={"PK": pk, "SK": sk})
    return resp.get("Item")


def _json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        # Only reached for a Decimal already in the dict (e.g. re-saving an
        # item that came back from get_item) — round-tripped straight back
        # to Decimal by parse_float below, this just gets it past json.dumps.
        return float(value)
    raise TypeError(f"Not JSON serializable: {type(value)}")


def _floats_to_decimal(item: Dict[str, Any]) -> Dict[str, Any]:
    """DynamoDB's resource API rejects Python floats outright (it wants
    Decimal, to avoid silent precision loss on money values) — round-trip
    through JSON with `parse_float=Decimal` rather than walking the dict by
    hand, since amounts can be nested inside lists/objects later."""
    return json.loads(json.dumps(item, default=_json_default), parse_float=Decimal)


def put_item(item: Dict[str, Any]) -> None:
    table().put_item(Item=_floats_to_decimal(item))


def delete_item(pk: str, sk: str) -> None:
    table().delete_item(Key={"PK": pk, "SK": sk})


def query_by_sk_prefix(pk: str, sk_prefix: str) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    kwargs = {"KeyConditionExpression": Key("PK").eq(pk) & Key("SK").begins_with(sk_prefix)}
    while True:
        resp = table().query(**kwargs)
        items.extend(resp.get("Items", []))
        last_key = resp.get("LastEvaluatedKey")
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key
    return items
