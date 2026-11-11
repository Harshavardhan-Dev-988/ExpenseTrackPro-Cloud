"""Recurring expenses: rules, due dates, and logging them.

A rule (RECUR#<id>) says "₹18,000 rent on the 5th of every month". While
it's active its next due date is indexed in GSI1 under DUE#<yyyy-mm>, so the
daily job can find every rule due today across all households with one
query per month (no scans).

When a rule comes due:
  * autoLog rules are logged straight away as an expense whose id is
    "r-<ruleId>-<yyyy-mm-dd>"; the put is conditional on that id not
    existing, so a retry or an overlapping run can never log twice;
  * other rules wait for someone to tap "Log it" (or "Skip").
Either way the rule's next due date then moves on.
"""
import calendar
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional, Tuple

import db
import keys as K

MAX_CATCH_UP = 24  # never log more than this many missed occurrences at once

STEP_MONTHS = {"monthly": 1, "quarterly": 3, "yearly": 12}


def today() -> date:
    # Indian households: judge "today" in IST so a rule due on the 1st is
    # logged on the 1st, not at 5:30 am the next day.
    return (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).date()


def _add_months(d: date, months: int, day_of_month: int) -> date:
    y, m = divmod(d.month - 1 + months, 12)
    year, month = d.year + y, m + 1
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(day_of_month, last))


def first_due(rule: dict) -> date:
    start = date.fromisoformat(str(rule["startDate"])[:10])
    freq = rule.get("frequency", "monthly")
    if freq == "weekly":
        wd = rule.get("weekday")
        wd = start.weekday() if wd is None else int(wd)
        return start + timedelta(days=(wd - start.weekday()) % 7)
    dom = int(rule.get("dayOfMonth") or start.day)
    candidate = _add_months(start.replace(day=1), 0, dom)
    if candidate < start:
        # That day has passed in the start month: the first one is next month.
        candidate = _add_months(start.replace(day=1), 1, dom)
    return candidate


def next_after(rule: dict, due: date) -> date:
    freq = rule.get("frequency", "monthly")
    if freq == "weekly":
        return due + timedelta(days=7)
    start = date.fromisoformat(str(rule["startDate"])[:10])
    dom = int(rule.get("dayOfMonth") or start.day)
    return _add_months(due.replace(day=1), STEP_MONTHS.get(freq, 1), dom)


def upcoming(rule: dict, until: date) -> List[date]:
    """Due dates from the rule's nextDue up to `until` (for previews)."""
    out: List[date] = []
    nd = rule.get("nextDue")
    if not nd or not rule.get("active", True):
        return out
    d = date.fromisoformat(str(nd)[:10])
    end = date.fromisoformat(str(rule["endDate"])[:10]) if rule.get("endDate") else None
    while d <= until and (end is None or d <= end) and len(out) < 60:
        out.append(d)
        d = next_after(rule, d)
    return out


def rule_item(ledger_id: str, rule: dict) -> dict:
    item = {"PK": K.ledger_pk(ledger_id), "SK": f"{K.RECURRING}{rule['id']}", **rule}
    nd = rule.get("nextDue")
    if rule.get("active", True) and nd:
        item["GSI1PK"] = K.due_gsi(str(nd))
        item["GSI1SK"] = f"{str(nd)[:10]}#{ledger_id}#{rule['id']}"
    else:
        item.pop("GSI1PK", None)
        item.pop("GSI1SK", None)
    return db.stamp(item, K.T_RECURRING)


def schedule(rule: dict, *, from_day: Optional[date] = None) -> dict:
    """Set nextDue (and active=False once past endDate)."""
    rule = dict(rule)
    nd = first_due(rule)
    if from_day:
        while nd < from_day:
            nd = next_after(rule, nd)
    end = date.fromisoformat(str(rule["endDate"])[:10]) if rule.get("endDate") else None
    if end and nd > end:
        rule["nextDue"] = None
        rule["active"] = False
    else:
        rule["nextDue"] = nd.isoformat()
    return rule


def expense_for(rule: dict, due: date, *, by_user: Optional[str] = None, by_name: Optional[str] = None) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "id": f"r-{rule['id']}-{due.isoformat()}",
        "date": f"{due.isoformat()}T09:00:00+05:30",
        "amount": rule["amount"],
        "category": rule["category"],
        "description": rule["description"],
        "paymentMethod": rule.get("paymentMethod"),
        "tags": rule.get("tags"),
        "paidBy": rule.get("paidBy"),
        "recurringId": rule["id"],
        "createdBy": by_user or rule.get("createdBy"),
        "createdByName": by_name or "Recurring",
        "createdAt": now,
        "updatedAt": now,
    }


def log_occurrence(ledger_id: str, rule: dict, due: date, **who) -> bool:
    """Log one occurrence; False if it was already logged."""
    from routers.expenses import expense_item  # avoid an import cycle

    expense = {k: v for k, v in expense_for(rule, due, **who).items() if v is not None}
    return db.put_item(expense_item(ledger_id, expense), if_absent=True)


def advance(ledger_id: str, rule: dict, past: date, *, logged: Optional[date] = None) -> dict:
    """Move nextDue beyond `past`, save, return the rule."""
    rule = dict(rule)
    nd = date.fromisoformat(str(rule["nextDue"])[:10])
    while nd <= past:
        nd = next_after(rule, nd)
    end = date.fromisoformat(str(rule["endDate"])[:10]) if rule.get("endDate") else None
    if end and nd > end:
        rule["nextDue"], rule["active"] = None, False
    else:
        rule["nextDue"] = nd.isoformat()
    if logged:
        rule["lastLoggedDue"] = logged.isoformat()
    rule["updatedAt"] = datetime.now(timezone.utc).isoformat()
    # Only the schedule fields, and only if the rule still exists: a full
    # put could undo an edit made meanwhile, or bring back a deleted rule.
    keys = rule_item(ledger_id, db.public(rule))
    fields = {k: rule.get(k) for k in ("nextDue", "active", "lastLoggedDue", "updatedAt")}
    if keys.get("GSI1PK"):
        fields.update({"GSI1PK": keys["GSI1PK"], "GSI1SK": keys["GSI1SK"]})
        remove = []
    else:
        remove = ["GSI1PK", "GSI1SK"]
    db.update_fields(K.ledger_pk(ledger_id), f"{K.RECURRING}{rule['id']}", fields, remove)
    return rule


def process_rule(ledger_id: str, rule: dict, as_of: date) -> Tuple[int, List[str]]:
    """Log what's due for an autoLog rule; for a manual rule, report the
    due dates waiting for confirmation. Returns (logged count, waiting)."""
    if not rule.get("active", True) or not rule.get("nextDue"):
        return 0, []
    due_dates = []
    d = date.fromisoformat(str(rule["nextDue"])[:10])
    end = date.fromisoformat(str(rule["endDate"])[:10]) if rule.get("endDate") else None
    while d <= as_of and (end is None or d <= end) and len(due_dates) < MAX_CATCH_UP:
        due_dates.append(d)
        d = next_after(rule, d)
    if not due_dates:
        return 0, []
    if not rule.get("autoLog", True):
        return 0, [x.isoformat() for x in due_dates]
    logged = sum(1 for x in due_dates if log_occurrence(ledger_id, rule, x))
    advance(ledger_id, rule, due_dates[-1], logged=due_dates[-1])
    return logged, []


def rules(ledger_id: str) -> List[dict]:
    return db.query(K.ledger_pk(ledger_id), K.RECURRING)


def run_ledger(ledger_id: str, as_of: Optional[date] = None) -> Tuple[int, List[dict]]:
    as_of = as_of or today()
    total, waiting = 0, []
    for rule in rules(ledger_id):
        n, w = process_rule(ledger_id, rule, as_of)
        total += n
        if w:
            waiting.append({"ruleId": rule["id"], "description": rule["description"], "amount": float(rule["amount"]), "dates": w})
    return total, waiting


def run_all(as_of: Optional[date] = None) -> int:
    """The daily job: every active rule due on or before as_of, all ledgers."""
    as_of = as_of or today()
    months = {as_of.strftime("%Y-%m"), (as_of.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")}
    logged = 0
    seen = set()
    for month in sorted(months):
        for item in db.query_index(db.GSI1, f"DUE#{month}", upto=f"{as_of.isoformat()}#￿"):
            key = (item["PK"], item["SK"])
            if key in seen:
                continue
            seen.add(key)
            ledger_id = item["PK"].split("#", 1)[1]
            # Read the rule itself (the index copy may be stale) and skip
            # households that have been deleted.
            rule = db.get_item(item["PK"], item["SK"], consistent=True)
            if not rule or not db.get_item(item["PK"], K.META):
                continue
            n, _ = process_rule(ledger_id, rule, as_of)
            logged += n
    return logged
