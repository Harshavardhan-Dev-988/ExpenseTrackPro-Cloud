"""CRUD for one user's per-category budgets — keyed by `category` itself
(there's only ever one active budget per category), so PUT is an upsert.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException

import db
from dependencies.auth import get_user_id
from models import Budget

router = APIRouter(prefix="/budgets", tags=["budgets"])

SK_PREFIX = "BUDGET#"


def _strip_keys(item: dict) -> dict:
    return {k: v for k, v in item.items() if k not in ("PK", "SK")}


@router.get("", response_model=List[Budget])
def list_budgets(user_id: str = Depends(get_user_id)):
    items = db.query_by_sk_prefix(db.user_pk(user_id), SK_PREFIX)
    return [Budget(**_strip_keys(i)) for i in items]


@router.put("/{category}", response_model=Budget)
def upsert_budget(category: str, payload: Budget, user_id: str = Depends(get_user_id)):
    if payload.category != category:
        raise HTTPException(status_code=400, detail="Body category must match the URL category")
    item = {"PK": db.user_pk(user_id), "SK": f"{SK_PREFIX}{category}", **payload.model_dump(mode="json")}
    db.put_item(item)
    return payload


@router.delete("/{category}", status_code=204)
def delete_budget(category: str, user_id: str = Depends(get_user_id)):
    existing = db.get_item(db.user_pk(user_id), f"{SK_PREFIX}{category}")
    if not existing:
        raise HTTPException(status_code=404, detail="Budget not found")
    db.delete_item(db.user_pk(user_id), f"{SK_PREFIX}{category}")
