"""Recurring expenses (rent, salaries, EMIs, school fees, SIPs).

GET    /recurring                list rules
POST   /recurring                create (first due date is on or after today)
PUT    /recurring/{id}           change; the schedule is recomputed
DELETE /recurring/{id}           delete (expenses already logged stay)
POST   /recurring/run            log everything due in this household now;
                                 returns rules waiting for confirmation
POST   /recurring/{id}/log       log one due occurrence by hand {due}
POST   /recurring/{id}/skip      skip one due occurrence {due}
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import db
import keys as K
from dependencies.ledger import LedgerCtx, editor, reader
from models import FREQUENCIES, Expense, Recurring, RecurringCreate, RecurringRunResult, RecurringUpdate
from routers.expenses import author_name, check_split
from services import recurring as R

router = APIRouter(prefix="/recurring", tags=["recurring"])


class DueDate(BaseModel):
    due: date


def _validate(rule: dict) -> None:
    if rule.get("frequency") not in FREQUENCIES:
        raise HTTPException(status_code=400, detail=f"Frequency must be one of {', '.join(FREQUENCIES)}")
    if float(rule.get("amount") or 0) <= 0:
        raise HTTPException(status_code=400, detail="Amount must be more than zero")
    if not str(rule.get("description") or "").strip():
        raise HTTPException(status_code=400, detail="Give the recurring expense a name")
    dom = rule.get("dayOfMonth")
    if dom is not None and not 1 <= int(dom) <= 31:
        raise HTTPException(status_code=400, detail="Day of month must be 1–31")
    wd = rule.get("weekday")
    if wd is not None and not 0 <= int(wd) <= 6:
        raise HTTPException(status_code=400, detail="Weekday must be 0 (Monday) – 6 (Sunday)")
    if rule.get("endDate") and str(rule["endDate"]) < str(rule["startDate"]):
        raise HTTPException(status_code=400, detail="End date is before the start date")
    check_split(float(rule["amount"]), rule.get("paidBy"), None)


def _get(ctx: LedgerCtx, rule_id: str) -> dict:
    item = db.get_item(ctx.pk, f"{K.RECURRING}{rule_id}")
    if not item:
        raise HTTPException(status_code=404, detail="Recurring expense not found")
    return db.public(item)


def _out(rule: dict) -> Recurring:
    return Recurring(**{k: v for k, v in rule.items() if v is not None})


@router.get("", response_model=List[Recurring], response_model_exclude_none=True)
def list_rules(ctx: LedgerCtx = Depends(reader)):
    rules = [_out(db.public(i)) for i in R.rules(ctx.ledger_id)]
    return sorted(rules, key=lambda r: (not r.active, str(r.nextDue or "9999"), r.description.lower()))


@router.post("", response_model=Recurring, status_code=201, response_model_exclude_none=True)
def create_rule(payload: RecurringCreate, ctx: LedgerCtx = Depends(editor)):
    now = datetime.now(timezone.utc).isoformat()
    rule = {"id": uuid.uuid4().hex[:12], **payload.model_dump(mode="json"), "createdBy": ctx.user_id,
            "createdAt": now, "updatedAt": now}
    _validate(rule)
    rule = R.schedule(rule, from_day=R.today())
    rule = {k: v for k, v in rule.items() if v is not None}
    db.put_item(R.rule_item(ctx.ledger_id, rule))
    return _out(rule)


@router.put("/{rule_id}", response_model=Recurring, response_model_exclude_none=True)
def update_rule(rule_id: str, payload: RecurringUpdate, ctx: LedgerCtx = Depends(editor)):
    rule = {**_get(ctx, rule_id), **payload.model_dump(mode="json", exclude_unset=True)}
    rule["updatedAt"] = datetime.now(timezone.utc).isoformat()
    _validate(rule)
    # Recompute the schedule from today (or the day after the last logged
    # occurrence, if that's later): editing never re-logs anything, a
    # resumed rule doesn't back-fill the months it was paused, and a
    # changed day can still fall before the old due date.
    from_day = R.today()
    if rule.get("lastLoggedDue"):
        from_day = max(from_day, date.fromisoformat(str(rule["lastLoggedDue"])[:10]) + timedelta(days=1))
    if rule.get("active", True):
        rule = R.schedule(rule, from_day=from_day)
    rule = {k: v for k, v in rule.items() if v is not None}
    db.put_item(R.rule_item(ctx.ledger_id, rule))
    return _out(rule)


@router.delete("/{rule_id}", status_code=204)
def delete_rule(rule_id: str, ctx: LedgerCtx = Depends(editor)):
    _get(ctx, rule_id)
    db.delete_item(ctx.pk, f"{K.RECURRING}{rule_id}")


@router.post("/run", response_model=RecurringRunResult)
def run_due(ctx: LedgerCtx = Depends(reader)):
    """Called by the app when a household opens. Viewers can't log, so for
    them this only reports what's due."""
    if ctx.role == "viewer":
        waiting = []
        for rule in R.rules(ctx.ledger_id):
            dates = [d.isoformat() for d in R.upcoming(db.public(rule), R.today())]
            if dates:
                waiting.append({"ruleId": rule["id"], "description": rule["description"],
                                "amount": float(rule["amount"]), "dates": dates})
        return RecurringRunResult(logged=0, due=waiting)
    logged, waiting = R.run_ledger(ctx.ledger_id)
    return RecurringRunResult(logged=logged, due=waiting)


@router.post("/{rule_id}/log", response_model=Expense, response_model_exclude_none=True)
def log_now(rule_id: str, payload: DueDate, ctx: LedgerCtx = Depends(editor)):
    rule = _get(ctx, rule_id)
    if not R.log_occurrence(ctx.ledger_id, rule, payload.due, by_user=ctx.user_id, by_name=author_name(ctx)):
        raise HTTPException(status_code=409, detail="That one is already logged")
    if rule.get("nextDue") and str(rule["nextDue"])[:10] <= payload.due.isoformat():
        R.advance(ctx.ledger_id, rule, payload.due, logged=payload.due)
    item = db.get_item(ctx.pk, f"{K.EXPENSE}r-{rule_id}-{payload.due.isoformat()}")
    return Expense(**db.public(item))


@router.post("/{rule_id}/skip", response_model=Recurring, response_model_exclude_none=True)
def skip(rule_id: str, payload: DueDate, ctx: LedgerCtx = Depends(editor)):
    rule = _get(ctx, rule_id)
    if not rule.get("nextDue") or str(rule["nextDue"])[:10] > payload.due.isoformat():
        raise HTTPException(status_code=409, detail="Nothing is due on that date")
    rule = R.advance(ctx.ledger_id, rule, payload.due)
    return _out(db.public(rule))
