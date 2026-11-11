"""A ledger's savings entries (SAVE#, also in GSI2 by date) and goals (GOAL#)."""
import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException

import db
import keys as K
from dependencies.ledger import LedgerCtx, editor, reader
from models import (
    SavingsEntry,
    SavingsEntryCreate,
    SavingsEntryUpdate,
    SavingsGoal,
    SavingsGoalCreate,
    SavingsGoalUpdate,
)

router = APIRouter(prefix="/savings", tags=["savings"])


def entry_item(ledger_id: str, entry: dict) -> dict:
    return db.stamp(
        {
            "PK": K.ledger_pk(ledger_id),
            "SK": f"{K.SAVINGS_ENTRY}{entry['id']}",
            "GSI2PK": K.by_date(ledger_id, "SAVE"),
            "GSI2SK": f"{K.day(entry['date'])}#{entry['id']}",
            **entry,
        },
        K.T_SAVINGS_ENTRY,
    )


def goal_item(ledger_id: str, goal: dict) -> dict:
    return db.stamp({"PK": K.ledger_pk(ledger_id), "SK": f"{K.SAVINGS_GOAL}{goal['id']}", **goal}, K.T_SAVINGS_GOAL)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---- Entries ------------------------------------------------------------

@router.get("/entries", response_model=List[SavingsEntry])
def list_entries(ctx: LedgerCtx = Depends(reader)):
    return [SavingsEntry(**db.public(i)) for i in db.query(ctx.pk, K.SAVINGS_ENTRY)]


@router.post("/entries", response_model=SavingsEntry, status_code=201)
def create_entry(payload: SavingsEntryCreate, ctx: LedgerCtx = Depends(editor)):
    entry = {"id": str(uuid.uuid4()), **payload.model_dump(mode="json"), "createdAt": _now(), "updatedAt": _now()}
    entry = {k: v for k, v in entry.items() if v is not None}
    db.put_item(entry_item(ctx.ledger_id, entry))
    return SavingsEntry(**entry)


@router.put("/entries/{entry_id}", response_model=SavingsEntry)
def update_entry(entry_id: str, payload: SavingsEntryUpdate, ctx: LedgerCtx = Depends(editor)):
    existing = db.get_item(ctx.pk, f"{K.SAVINGS_ENTRY}{entry_id}")
    if not existing:
        raise HTTPException(status_code=404, detail="Savings entry not found")
    updates = {k: v for k, v in payload.model_dump(mode="json").items() if v is not None}
    merged = {**db.public(existing), **updates, "updatedAt": _now()}
    db.put_item(entry_item(ctx.ledger_id, merged))
    return SavingsEntry(**merged)


@router.delete("/entries/{entry_id}", status_code=204)
def delete_entry(entry_id: str, ctx: LedgerCtx = Depends(editor)):
    if not db.get_item(ctx.pk, f"{K.SAVINGS_ENTRY}{entry_id}"):
        raise HTTPException(status_code=404, detail="Savings entry not found")
    db.delete_item(ctx.pk, f"{K.SAVINGS_ENTRY}{entry_id}")


# ---- Goals ----------------------------------------------------------------

@router.get("/goals", response_model=List[SavingsGoal])
def list_goals(ctx: LedgerCtx = Depends(reader)):
    return [SavingsGoal(**db.public(i)) for i in db.query(ctx.pk, K.SAVINGS_GOAL)]


@router.post("/goals", response_model=SavingsGoal, status_code=201)
def create_goal(payload: SavingsGoalCreate, ctx: LedgerCtx = Depends(editor)):
    goal = {"id": str(uuid.uuid4()), **payload.model_dump(mode="json"), "createdAt": _now()}
    goal = {k: v for k, v in goal.items() if v is not None}
    db.put_item(goal_item(ctx.ledger_id, goal))
    return SavingsGoal(**goal)


@router.put("/goals/{goal_id}", response_model=SavingsGoal)
def update_goal(goal_id: str, payload: SavingsGoalUpdate, ctx: LedgerCtx = Depends(editor)):
    existing = db.get_item(ctx.pk, f"{K.SAVINGS_GOAL}{goal_id}")
    if not existing:
        raise HTTPException(status_code=404, detail="Savings goal not found")
    updates = {k: v for k, v in payload.model_dump(mode="json").items() if v is not None}
    merged = {**db.public(existing), **updates}
    db.put_item(goal_item(ctx.ledger_id, merged))
    return SavingsGoal(**merged)


@router.delete("/goals/{goal_id}", status_code=204)
def delete_goal(goal_id: str, ctx: LedgerCtx = Depends(editor)):
    if not db.get_item(ctx.pk, f"{K.SAVINGS_GOAL}{goal_id}"):
        raise HTTPException(status_code=404, detail="Savings goal not found")
    db.delete_item(ctx.pk, f"{K.SAVINGS_GOAL}{goal_id}")
