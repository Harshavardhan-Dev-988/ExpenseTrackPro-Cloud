"""Thin DynamoDB helpers over the single table (key design: keys.py).

Every function takes and returns plain dicts; routers turn them into and
out of Pydantic models. Numbers go in as Decimal (DynamoDB refuses floats)
and come back out as int/float via `public()`.
"""
import json
import os
from decimal import Decimal
from typing import Any, Dict, Iterable, Iterator, List, Optional

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

import keys as K

_tables: Dict[str, Any] = {}
_client = None

# Attributes that exist for storage, never for the API.
INTERNAL = {"PK", "SK", "GSI1PK", "GSI1SK", "GSI2PK", "GSI2SK", "type", "v", "ttl"}

GSI1 = "GSI1"
GSI2 = "GSI2"


def table(name: Optional[str] = None):
    """The boto3 Table, created lazily so importing this module needs no
    AWS credentials (unit tests mock AWS before first use)."""
    name = name or os.environ["TABLE_NAME"]
    if name not in _tables:
        _tables[name] = boto3.resource("dynamodb").Table(name)
    return _tables[name]


def client():
    global _client
    if _client is None:
        _client = boto3.client("dynamodb")
    return _client


def reset() -> None:
    """Forget cached clients (tests create a fresh mock per test)."""
    global _client
    _tables.clear()
    _client = None


# ---- conversion ------------------------------------------------------------

def _json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    raise TypeError(f"Not JSON serializable: {type(value)}")


def to_dynamo(item: Dict[str, Any]) -> Dict[str, Any]:
    """Floats -> Decimal (also inside lists/maps), and drop top-level None
    values, which DynamoDB would otherwise store as an explicit NULL."""
    clean = {k: v for k, v in item.items() if v is not None}
    return json.loads(json.dumps(clean, default=_json_default), parse_float=Decimal)


def _plain(value: Any) -> Any:
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, list):
        return [_plain(v) for v in value]
    if isinstance(value, dict):
        return {k: _plain(v) for k, v in value.items()}
    return value


def public(item: Dict[str, Any]) -> Dict[str, Any]:
    """An item without its storage attributes, with plain numbers."""
    return {k: _plain(v) for k, v in item.items() if k not in INTERNAL}


def stamp(item: Dict[str, Any], type_name: str) -> Dict[str, Any]:
    return {**item, "type": type_name, "v": K.SCHEMA_VERSION}


# ---- single items ----------------------------------------------------------

def get_item(pk: str, sk: str, consistent: bool = False) -> Optional[Dict[str, Any]]:
    resp = table().get_item(Key={"PK": pk, "SK": sk}, ConsistentRead=consistent)
    return resp.get("Item")


def put_item(item: Dict[str, Any], *, if_absent: bool = False) -> bool:
    """Write an item. With if_absent, only when the key is new; returns
    False (instead of raising) if it already existed."""
    kwargs: Dict[str, Any] = {"Item": to_dynamo(item)}
    if if_absent:
        kwargs["ConditionExpression"] = "attribute_not_exists(PK)"
    try:
        table().put_item(**kwargs)
        return True
    except ClientError as err:
        if if_absent and err.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return False
        raise


def update_fields(pk: str, sk: str, set_fields: Dict[str, Any], remove: Iterable[str] = (), *, must_exist: bool = True) -> bool:
    """Change only some attributes of an item (never a stale full copy).
    With must_exist (default) nothing happens if the item is gone; returns
    False in that case."""
    names, values, sets = {}, {}, []
    for i, (k, v) in enumerate(set_fields.items()):
        if v is None:
            remove = [*remove, k]
            continue
        names[f"#s{i}"] = k
        values[f":s{i}"] = v
        sets.append(f"#s{i} = :s{i}")
    rem = []
    for j, k in enumerate(dict.fromkeys(remove)):
        names[f"#r{j}"] = k
        rem.append(f"#r{j}")
    expr = " ".join(p for p in (("SET " + ", ".join(sets)) if sets else "", ("REMOVE " + ", ".join(rem)) if rem else "") if p)
    if not expr:
        return True
    kwargs: Dict[str, Any] = {"Key": {"PK": pk, "SK": sk}, "UpdateExpression": expr, "ExpressionAttributeNames": names}
    if values:
        kwargs["ExpressionAttributeValues"] = to_dynamo(values)
    if must_exist:
        kwargs["ConditionExpression"] = "attribute_exists(PK)"
    try:
        table().update_item(**kwargs)
        return True
    except ClientError as err:
        if must_exist and err.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return False
        raise


def delete_item(pk: str, sk: str) -> None:
    table().delete_item(Key={"PK": pk, "SK": sk})


# ---- queries ---------------------------------------------------------------

def _paginate(kwargs: Dict[str, Any], index: Optional[str] = None, tbl=None) -> Iterator[Dict[str, Any]]:
    if index:
        kwargs["IndexName"] = index
    tbl = tbl or table()
    while True:
        resp = tbl.query(**kwargs)
        yield from resp.get("Items", [])
        last = resp.get("LastEvaluatedKey")
        if not last:
            return
        kwargs["ExclusiveStartKey"] = last


def query(pk: str, sk_prefix: str = "") -> List[Dict[str, Any]]:
    """Every item in a partition whose SK starts with sk_prefix."""
    cond = Key("PK").eq(pk)
    if sk_prefix:
        cond = cond & Key("SK").begins_with(sk_prefix)
    return list(_paginate({"KeyConditionExpression": cond}))


def query_index(
    index: str,
    pk: str,
    *,
    prefix: Optional[str] = None,
    between: Optional[tuple] = None,
    upto: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Query GSI1/GSI2 by partition, optionally narrowed by a sort-key
    prefix, an inclusive range, or "everything up to" a value.
    The GSIs project all attributes, so these are full items."""
    pk_attr, sk_attr = f"{index}PK", f"{index}SK"
    cond = Key(pk_attr).eq(pk)
    if prefix:
        cond = cond & Key(sk_attr).begins_with(prefix)
    elif between:
        cond = cond & Key(sk_attr).between(*between)
    elif upto:
        cond = cond & Key(sk_attr).lte(upto)
    return list(_paginate({"KeyConditionExpression": cond}, index=index))


# ---- batches & transactions ------------------------------------------------

def batch_write(puts: Iterable[Dict[str, Any]] = (), deletes: Iterable[tuple] = ()) -> None:
    """Many puts/deletes, 25 per request; boto3's batch_writer resends
    unprocessed (throttled) items itself."""
    with table().batch_writer(overwrite_by_pkeys=["PK", "SK"]) as writer:
        for item in puts:
            writer.put_item(Item=to_dynamo(item))
        for pk, sk in deletes:
            writer.delete_item(Key={"PK": pk, "SK": sk})


def transact(ops: List[Dict[str, Any]]) -> None:
    """All-or-nothing write of up to 100 operations, each one of
    {"put": item}, {"put_new": item} (fails if the key exists),
    {"delete": (pk, sk)} or {"require": (pk, sk)} (must exist)."""
    from boto3.dynamodb.types import TypeSerializer

    ser = TypeSerializer()
    name = table().name

    def marshal(item: Dict[str, Any]) -> Dict[str, Any]:
        return {k: ser.serialize(v) for k, v in to_dynamo(item).items()}

    items = []
    for op in ops:
        if "put" in op:
            items.append({"Put": {"TableName": name, "Item": marshal(op["put"])}})
        elif "put_new" in op:
            items.append({"Put": {"TableName": name, "Item": marshal(op["put_new"]),
                                  "ConditionExpression": "attribute_not_exists(PK)"}})
        elif "delete" in op:
            pk, sk = op["delete"]
            items.append({"Delete": {"TableName": name, "Key": marshal({"PK": pk, "SK": sk})}})
        elif "require" in op:
            pk, sk = op["require"]
            items.append({"ConditionCheck": {"TableName": name, "Key": marshal({"PK": pk, "SK": sk}),
                                             "ConditionExpression": "attribute_exists(PK)"}})
    client().transact_write_items(TransactItems=items)


def scan_all(table_name: str) -> Iterator[Dict[str, Any]]:
    """Every item of a table (migrations only)."""
    tbl = table(table_name)
    kwargs: Dict[str, Any] = {}
    while True:
        resp = tbl.scan(**kwargs)
        yield from resp.get("Items", [])
        last = resp.get("LastEvaluatedKey")
        if not last:
            return
        kwargs["ExclusiveStartKey"] = last
