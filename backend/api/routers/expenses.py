"""A ledger's expenses.

Stored as  PK=LEDGER#<lid>  SK=EXP#<id>, plus
  GSI2  LEDGER#<lid>#EXP / <yyyy-mm-dd>#<id>    for date-range reads, and
  GSI1  LEDGER#<lid>#SPLIT / <yyyy-mm-dd>#<id>  only when the expense is split.
"""
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

import db
import keys as K
from dependencies.ledger import LedgerCtx, editor, reader
from models import Expense, ExpenseBatchCreate, ExpenseCreate, ExpenseUpdate, IdList

router = APIRouter(prefix="/expenses", tags=["expenses"])

BATCH_LIMIT = 100


def expense_item(ledger_id: str, expense: dict) -> dict:
    """The stored item for an expense dict (id, date, amount, …)."""
    d = K.day(expense["date"])
    item = {
        "PK": K.ledger_pk(ledger_id),
        "SK": f"{K.EXPENSE}{expense['id']}",
        "GSI2PK": K.by_date(ledger_id, "EXP"),
        "GSI2SK": f"{d}#{expense['id']}",
        **expense,
    }
    split = expense.get("split")
    if split and split.get("shares"):
        item["GSI1PK"] = K.splits_gsi(ledger_id)
        item["GSI1SK"] = f"{d}#{expense['id']}"
    else:
        item.pop("GSI1PK", None)
        item.pop("GSI1SK", None)
        item.pop("split", None)
    return db.stamp(item, K.T_EXPENSE)


def check_split(amount: float, paid_by: Optional[str], split: Optional[dict]) -> None:
    if not split or not split.get("shares"):
        return
    shares = split["shares"]
    if any(s["amount"] < 0 for s in shares):
        raise HTTPException(status_code=400, detail="Split shares can't be negative")
    if abs(sum(s["amount"] for s in shares) - amount) > 0.05:
        raise HTTPException(status_code=400, detail="Split shares must add up to the expense amount")
    people = [s["person"] for s in shares]
    if len(set(people)) != len(people):
        raise HTTPException(status_code=400, detail="Each person can appear in a split only once")
    if not paid_by:
        raise HTTPException(status_code=400, detail="Say who paid for a split expense")
    for ref in people + [paid_by]:
        if not (ref.startswith("m:") or ref.startswith("n:")) or len(ref) < 3:
            raise HTTPException(status_code=400, detail=f"Unknown person '{ref}'")


def author_name(ctx: LedgerCtx) -> Optional[str]:
    return ctx.identity.name or (ctx.identity.email or "").split("@")[0] or None


def new_expense(ctx: LedgerCtx, payload: ExpenseCreate, *, expense_id: Optional[str] = None) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    body = payload.model_dump(mode="json")
    if body.get("split") and not body.get("paidBy"):
        body["paidBy"] = ctx.person
    check_split(body["amount"], body.get("paidBy"), body.get("split"))
    return {
        "id": expense_id or str(uuid.uuid4()),
        **{k: v for k, v in body.items() if v is not None},
        "createdBy": ctx.user_id,
        "createdByName": author_name(ctx),
        "createdAt": now,
        "updatedAt": now,
    }


@router.get("", response_model=List[Expense], response_model_exclude_none=True)
def list_expenses(
    start: Optional[str] = None,
    end: Optional[str] = None,
    ctx: LedgerCtx = Depends(reader),
):
    """All expenses, or only those dated start..end (yyyy-mm-dd, inclusive)."""
    if start or end:
        lo = (start or "0000-01-01")[:10]
        hi = (end or "9999-12-31")[:10] + "#￿"
        items = db.query_index(db.GSI2, K.by_date(ctx.ledger_id, "EXP"), between=(lo, hi))
    else:
        items = db.query(ctx.pk, K.EXPENSE)
    return [Expense(**db.public(i)) for i in items]


@router.post("", response_model=Expense, status_code=201, response_model_exclude_none=True)
def create_expense(payload: ExpenseCreate, ctx: LedgerCtx = Depends(editor)):
    expense = new_expense(ctx, payload)
    db.put_item(expense_item(ctx.ledger_id, expense))
    return Expense(**expense)


@router.post("/batch", response_model=List[Expense], status_code=201, response_model_exclude_none=True)
def create_expenses(payload: ExpenseBatchCreate, ctx: LedgerCtx = Depends(editor)):
    """Up to 100 expenses in one call (imports, restores)."""
    if len(payload.items) > BATCH_LIMIT:
        raise HTTPException(status_code=400, detail=f"At most {BATCH_LIMIT} expenses per batch")
    expenses = [new_expense(ctx, p) for p in payload.items]
    db.batch_write(puts=[expense_item(ctx.ledger_id, e) for e in expenses])
    return [Expense(**e) for e in expenses]


@router.post("/batch-delete", status_code=204)
def delete_expenses(payload: IdList, ctx: LedgerCtx = Depends(editor)):
    if len(payload.ids) > BATCH_LIMIT * 5:
        raise HTTPException(status_code=400, detail=f"At most {BATCH_LIMIT * 5} ids per call")
    db.batch_write(deletes=[(ctx.pk, f"{K.EXPENSE}{i}") for i in payload.ids])


@router.put("/{expense_id}", response_model=Expense, response_model_exclude_none=True)
def update_expense(expense_id: str, payload: ExpenseUpdate, ctx: LedgerCtx = Depends(editor)):
    existing = db.get_item(ctx.pk, f"{K.EXPENSE}{expense_id}")
    if not existing:
        raise HTTPException(status_code=404, detail="Expense not found")
    # exclude_unset: a field sent as null clears it; a field not sent stays.
    updates = payload.model_dump(mode="json", exclude_unset=True)
    merged = {**db.public(existing), **updates, "updatedAt": datetime.now(timezone.utc).isoformat()}
    if merged.get("split") and not merged.get("paidBy"):
        merged["paidBy"] = ctx.person
    check_split(merged["amount"], merged.get("paidBy"), merged.get("split"))
    merged = {k: v for k, v in merged.items() if v is not None}
    db.put_item(expense_item(ctx.ledger_id, merged))
    return Expense(**merged)


@router.delete("/{expense_id}", status_code=204)
def delete_expense(expense_id: str, ctx: LedgerCtx = Depends(editor)):
    if not db.get_item(ctx.pk, f"{K.EXPENSE}{expense_id}"):
        raise HTTPException(status_code=404, detail="Expense not found")
    db.delete_item(ctx.pk, f"{K.EXPENSE}{expense_id}")
