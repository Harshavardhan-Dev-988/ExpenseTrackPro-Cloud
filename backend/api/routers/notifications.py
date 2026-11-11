"""Email notifications: what's been built while sending is off, and a
preview of the monthly summary for the current household."""
from datetime import timedelta
from typing import List

from fastapi import APIRouter, Depends
from pydantic import BaseModel

import db
import keys as K
from dependencies.ledger import LedgerCtx, editor, reader
from services import notify as N

router = APIRouter(prefix="/notifications", tags=["notifications"])


class EmailPreview(BaseModel):
    kind: str
    subject: str
    html: str
    to: List[str] = []
    createdAt: str = ""


@router.get("/outbox", response_model=List[EmailPreview])
def outbox(ctx: LedgerCtx = Depends(editor)):
    items = db.query(ctx.pk, K.OUTBOX)
    items.sort(key=lambda i: i["SK"], reverse=True)
    return [EmailPreview(**{k: v for k, v in db.public(i).items() if k in EmailPreview.model_fields}) for i in items[:20]]


@router.get("/preview/monthly-summary", response_model=EmailPreview)
def preview_summary(ctx: LedgerCtx = Depends(reader)):
    """Last month's summary for this household, built now, not sent."""
    last_month = N.ist_today().replace(day=1) - timedelta(days=1)
    data = N.summary_data(ctx.ledger_id, last_month)
    if data["count"] == 0:
        return EmailPreview(kind="monthly-summary", html="",
                            subject=f"No expenses in {last_month.strftime('%B %Y')}, so no summary would be sent")
    name, currency = N._ledger_basics(ctx.ledger_id)
    subject, html_body, _ = N.render_summary(name, data, currency)
    return EmailPreview(kind="monthly-summary", subject=subject, html=html_body)


@router.get("/preview/budget-alert", response_model=EmailPreview)
def preview_alert(ctx: LedgerCtx = Depends(reader)):
    """What a budget alert would say right now (all flagged budgets)."""
    flagged = [s for s in N.budget_statuses(ctx.ledger_id, N.ist_today()) if s["state"] != "ok"]
    name, currency = N._ledger_basics(ctx.ledger_id)
    if not flagged:
        return EmailPreview(kind="budget-alert", subject="No budget alerts right now", html="")
    subject, html_body, _ = N.render_budget_alert(name, flagged, currency)
    return EmailPreview(kind="budget-alert", subject=subject, html=html_body)
