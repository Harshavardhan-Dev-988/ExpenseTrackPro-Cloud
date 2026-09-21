"""CRUD for one user's expenses — the cloud equivalent of the frontend's
`db.ts` (IndexedDB) `expenses` object store.
"""
import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException

import db
from dependencies.auth import get_user_id
from models import Expense, ExpenseCreate, ExpenseUpdate

router = APIRouter(prefix="/expenses", tags=["expenses"])

SK_PREFIX = "EXPENSE#"


def _to_item(user_id: str, expense: dict) -> dict:
    return {
        "PK": db.user_pk(user_id),
        "SK": f"{SK_PREFIX}{expense['id']}",
        **expense,
    }


def _from_item(item: dict) -> Expense:
    body = {k: v for k, v in item.items() if k not in ("PK", "SK")}
    return Expense(**body)


@router.get("", response_model=List[Expense])
def list_expenses(user_id: str = Depends(get_user_id)):
    items = db.query_by_sk_prefix(db.user_pk(user_id), SK_PREFIX)
    return [_from_item(i) for i in items]


@router.post("", response_model=Expense, status_code=201)
def create_expense(payload: ExpenseCreate, user_id: str = Depends(get_user_id)):
    now = datetime.now(timezone.utc)
    expense = {
        "id": str(uuid.uuid4()),
        **payload.model_dump(mode="json"),
        "createdAt": now.isoformat(),
        "updatedAt": now.isoformat(),
    }
    db.put_item(_to_item(user_id, expense))
    return _from_item(_to_item(user_id, expense))


@router.put("/{expense_id}", response_model=Expense)
def update_expense(expense_id: str, payload: ExpenseUpdate, user_id: str = Depends(get_user_id)):
    existing = db.get_item(db.user_pk(user_id), f"{SK_PREFIX}{expense_id}")
    if not existing:
        raise HTTPException(status_code=404, detail="Expense not found")

    updates = {k: v for k, v in payload.model_dump(mode="json").items() if v is not None}
    merged = {**existing, **updates, "updatedAt": datetime.now(timezone.utc).isoformat()}
    db.put_item(merged)
    return _from_item(merged)


@router.delete("/{expense_id}", status_code=204)
def delete_expense(expense_id: str, user_id: str = Depends(get_user_id)):
    existing = db.get_item(db.user_pk(user_id), f"{SK_PREFIX}{expense_id}")
    if not existing:
        raise HTTPException(status_code=404, detail="Expense not found")
    db.delete_item(db.user_pk(user_id), f"{SK_PREFIX}{expense_id}")
