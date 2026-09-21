"""CRUD for savings entries and savings goals — same shape as expenses.py,
kept in one file since both are small and closely related.
"""
import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException

import db
from dependencies.auth import get_user_id
from models import (
    SavingsEntry,
    SavingsEntryCreate,
    SavingsEntryUpdate,
    SavingsGoal,
    SavingsGoalCreate,
    SavingsGoalUpdate,
)

router = APIRouter(prefix="/savings", tags=["savings"])

ENTRY_SK_PREFIX = "SAVINGS_ENTRY#"
GOAL_SK_PREFIX = "SAVINGS_GOAL#"


def _strip_keys(item: dict) -> dict:
    return {k: v for k, v in item.items() if k not in ("PK", "SK")}


# ---- Entries ------------------------------------------------------------

@router.get("/entries", response_model=List[SavingsEntry])
def list_entries(user_id: str = Depends(get_user_id)):
    items = db.query_by_sk_prefix(db.user_pk(user_id), ENTRY_SK_PREFIX)
    return [SavingsEntry(**_strip_keys(i)) for i in items]


@router.post("/entries", response_model=SavingsEntry, status_code=201)
def create_entry(payload: SavingsEntryCreate, user_id: str = Depends(get_user_id)):
    now = datetime.now(timezone.utc)
    entry = {
        "id": str(uuid.uuid4()),
        **payload.model_dump(mode="json"),
        "createdAt": now.isoformat(),
        "updatedAt": now.isoformat(),
    }
    db.put_item({"PK": db.user_pk(user_id), "SK": f"{ENTRY_SK_PREFIX}{entry['id']}", **entry})
    return SavingsEntry(**entry)


@router.put("/entries/{entry_id}", response_model=SavingsEntry)
def update_entry(entry_id: str, payload: SavingsEntryUpdate, user_id: str = Depends(get_user_id)):
    existing = db.get_item(db.user_pk(user_id), f"{ENTRY_SK_PREFIX}{entry_id}")
    if not existing:
        raise HTTPException(status_code=404, detail="Savings entry not found")
    updates = {k: v for k, v in payload.model_dump(mode="json").items() if v is not None}
    merged = {**existing, **updates, "updatedAt": datetime.now(timezone.utc).isoformat()}
    db.put_item(merged)
    return SavingsEntry(**_strip_keys(merged))


@router.delete("/entries/{entry_id}", status_code=204)
def delete_entry(entry_id: str, user_id: str = Depends(get_user_id)):
    existing = db.get_item(db.user_pk(user_id), f"{ENTRY_SK_PREFIX}{entry_id}")
    if not existing:
        raise HTTPException(status_code=404, detail="Savings entry not found")
    db.delete_item(db.user_pk(user_id), f"{ENTRY_SK_PREFIX}{entry_id}")


# ---- Goals ----------------------------------------------------------------

@router.get("/goals", response_model=List[SavingsGoal])
def list_goals(user_id: str = Depends(get_user_id)):
    items = db.query_by_sk_prefix(db.user_pk(user_id), GOAL_SK_PREFIX)
    return [SavingsGoal(**_strip_keys(i)) for i in items]


@router.post("/goals", response_model=SavingsGoal, status_code=201)
def create_goal(payload: SavingsGoalCreate, user_id: str = Depends(get_user_id)):
    goal = {
        "id": str(uuid.uuid4()),
        **payload.model_dump(mode="json"),
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    db.put_item({"PK": db.user_pk(user_id), "SK": f"{GOAL_SK_PREFIX}{goal['id']}", **goal})
    return SavingsGoal(**goal)


@router.put("/goals/{goal_id}", response_model=SavingsGoal)
def update_goal(goal_id: str, payload: SavingsGoalUpdate, user_id: str = Depends(get_user_id)):
    existing = db.get_item(db.user_pk(user_id), f"{GOAL_SK_PREFIX}{goal_id}")
    if not existing:
        raise HTTPException(status_code=404, detail="Savings goal not found")
    updates = {k: v for k, v in payload.model_dump(mode="json").items() if v is not None}
    merged = {**existing, **updates}
    db.put_item(merged)
    return SavingsGoal(**_strip_keys(merged))


@router.delete("/goals/{goal_id}", status_code=204)
def delete_goal(goal_id: str, user_id: str = Depends(get_user_id)):
    existing = db.get_item(db.user_pk(user_id), f"{GOAL_SK_PREFIX}{goal_id}")
    if not existing:
        raise HTTPException(status_code=404, detail="Savings goal not found")
    db.delete_item(db.user_pk(user_id), f"{GOAL_SK_PREFIX}{goal_id}")
