"""A ledger's budgets — one per key (a category id, or "group:<id>" for a
whole parent group), so PUT is an upsert.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException

import db
import keys as K
from dependencies.ledger import LedgerCtx, editor, reader
from models import Budget

router = APIRouter(prefix="/budgets", tags=["budgets"])


def budget_item(ledger_id: str, budget: dict) -> dict:
    return db.stamp(
        {"PK": K.ledger_pk(ledger_id), "SK": f"{K.BUDGET}{budget['category']}", **budget},
        K.T_BUDGET,
    )


@router.get("", response_model=List[Budget])
def list_budgets(ctx: LedgerCtx = Depends(reader)):
    return [Budget(**db.public(i)) for i in db.query(ctx.pk, K.BUDGET)]


@router.put("/{category}", response_model=Budget)
def upsert_budget(category: str, payload: Budget, ctx: LedgerCtx = Depends(editor)):
    if payload.category != category:
        raise HTTPException(status_code=400, detail="Body category must match the URL category")
    db.put_item(budget_item(ctx.ledger_id, payload.model_dump(mode="json")))
    return payload


@router.delete("/{category}", status_code=204)
def delete_budget(category: str, ctx: LedgerCtx = Depends(editor)):
    if not db.get_item(ctx.pk, f"{K.BUDGET}{category}"):
        raise HTTPException(status_code=404, detail="Budget not found")
    db.delete_item(ctx.pk, f"{K.BUDGET}{category}")
