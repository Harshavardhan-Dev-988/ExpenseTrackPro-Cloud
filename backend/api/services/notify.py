"""Budget alert and monthly summary emails.

Built by the scheduled jobs (jobs_handler.py). Sending goes through Amazon
SES only when EMAIL_ENABLED=true and EMAIL_FROM is set — until the app has
its own domain both stay off, and each email is written to the ledger's
OUTBOX instead (kept 30 days) so it can be previewed in the app.

Each alert is sent once per budget, period and state (SENT# markers), so a
budget that stays over its limit doesn't email every day.
"""
import calendar
import html
import json
import os
import pathlib
import time
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

import boto3

import db
import keys as K
from services import ledgers as L

_CATALOG = json.loads((pathlib.Path(__file__).resolve().parents[1] / "catalog.json").read_text(encoding="utf-8"))
GROUPS: Dict[str, dict] = {g["id"]: g for g in _CATALOG["groups"]}
LABELS: Dict[str, str] = _CATALOG["labels"]

APP_URL = os.environ.get("APP_URL", "https://d3bttra9tv41h7.cloudfront.net")

_ses = None


def email_enabled() -> bool:
    return os.environ.get("EMAIL_ENABLED", "false").lower() == "true" and bool(os.environ.get("EMAIL_FROM"))


def _ses_client():
    global _ses
    if _ses is None:
        _ses = boto3.client("sesv2")
    return _ses


def ist_today() -> date:
    return (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).date()


# ---- money & categories ----------------------------------------------------------

def rupees(amount: float, currency: str = "INR") -> str:
    """₹1,23,456 — Indian digit grouping."""
    if currency != "INR":
        return f"{currency} {amount:,.0f}"
    n = int(round(abs(amount)))
    s = str(n)
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        s = ",".join(parts) + "," + tail
    return ("−" if amount < 0 else "") + "₹" + s


def category_label(cat: str, custom: Dict[str, str]) -> str:
    return custom.get(cat) or LABELS.get(cat) or cat.replace("_", " ").title()


def budget_label(key: str, custom_labels: Dict[str, str], custom_groups: Dict[str, str]) -> str:
    if key.startswith("group:"):
        gid = key[6:]
        return f"{GROUPS.get(gid, {}).get('name') or custom_groups.get(gid) or gid} (whole group)"
    return category_label(key, custom_labels)


def _custom(ledger_id: str):
    pk = K.ledger_pk(ledger_id)
    cats = db.query(pk, K.CATEGORY)
    groups = db.query(pk, K.CATEGORY_GROUP)
    return (
        {c["id"]: c["label"] for c in cats},
        {g["id"]: g["name"] for g in groups},
        {c["id"]: c["groupId"] for c in cats},
    )


def categories_for_key(key: str, custom_group_of: Dict[str, str]) -> List[str]:
    if not key.startswith("group:"):
        return [key]
    gid = key[6:]
    built_in = list(GROUPS.get(gid, {}).get("categories", []))
    return built_in + [c for c, g in custom_group_of.items() if g == gid]


# ---- periods ---------------------------------------------------------------------

def year_bounds(as_of: date, year_start: str) -> Tuple[date, date]:
    if year_start == "apr":
        start = date(as_of.year if as_of.month >= 4 else as_of.year - 1, 4, 1)
        return start, date(start.year + 1, 3, 31)
    return date(as_of.year, 1, 1), date(as_of.year, 12, 31)


def month_bounds(d: date) -> Tuple[date, date]:
    return d.replace(day=1), d.replace(day=calendar.monthrange(d.year, d.month)[1])


def expenses_between(ledger_id: str, start: date, end: date) -> List[dict]:
    return db.query_index(
        db.GSI2, K.by_date(ledger_id, "EXP"), between=(start.isoformat(), end.isoformat() + "#￿")
    )


def _sum_by_cat(items: List[dict]) -> Dict[str, float]:
    out: Dict[str, float] = defaultdict(float)
    for e in items:
        out[e["category"]] += float(e["amount"])
    return out


# ---- budget status (same rules as the dashboard: utils/period.ts) ------------------

def budget_statuses(ledger_id: str, as_of: date) -> List[dict]:
    budgets = [b for b in db.query(K.ledger_pk(ledger_id), K.BUDGET) if b.get("isActive", True)]
    if not budgets:
        return []
    settings = db.public(db.get_item(K.ledger_pk(ledger_id), K.SETTINGS) or {})
    year_start = settings.get("yearStart", "jan")
    m0, m1 = month_bounds(as_of)
    y0, y1 = year_bounds(as_of, year_start)
    month_spend = _sum_by_cat(expenses_between(ledger_id, m0, m1))
    year_spend = _sum_by_cat(expenses_between(ledger_id, y0, y1))
    labels, group_names, group_of = _custom(ledger_id)

    out = []
    for b in budgets:
        yearly = b.get("budgetType") == "yearly"
        limit = float(b.get("yearlyLimit" if yearly else "monthlyLimit") or 0)
        if limit <= 0:
            continue
        spend = year_spend if yearly else month_spend
        cats = categories_for_key(b["category"], group_of)
        spent = sum(spend.get(c, 0.0) for c in cats)
        pct = spent / limit * 100
        threshold = float(b.get("alertThreshold") or 80)
        state = "exceeded" if pct >= 100 else "warning" if pct >= threshold else "ok"
        period = f"{y0.isoformat()}" if yearly else m0.strftime("%Y-%m")
        out.append({
            "key": b["category"],
            "label": budget_label(b["category"], labels, group_names),
            "spent": spent,
            "limit": limit,
            "pct": pct,
            "state": state,
            "yearly": yearly,
            "period": period,
            "periodLabel": (f"FY {y0.year}–{str(y1.year)[2:]}" if year_start == "apr" else str(y0.year)) if yearly
            else m0.strftime("%B %Y"),
        })
    return sorted(out, key=lambda s: -s["pct"])


# ---- recipients & sending --------------------------------------------------------

def recipients(ledger_id: str, pref: str) -> List[dict]:
    out = []
    for m in L.members(ledger_id):
        profile = db.public(L.get_profile(m["userId"]) or {})
        if not profile.get(pref, True):
            continue
        email = m.get("email") or profile.get("email")
        if email:
            out.append({"userId": m["userId"], "email": email, "name": m.get("name") or profile.get("name")})
    return out


def deliver(ledger_id: str, kind: str, to: List[str], subject: str, html_body: str, text_body: str) -> str:
    """Send through SES, or keep in the OUTBOX while sending is off."""
    if not to:
        return "no-recipients"
    if email_enabled():
        _ses_client().send_email(
            FromEmailAddress=os.environ["EMAIL_FROM"],
            Destination={"ToAddresses": to},
            Content={"Simple": {
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {"Html": {"Data": html_body, "Charset": "UTF-8"}, "Text": {"Data": text_body, "Charset": "UTF-8"}},
            }},
        )
        return "sent"
    ts = datetime.now(timezone.utc).isoformat()
    db.put_item(db.stamp({
        "PK": K.ledger_pk(ledger_id),
        "SK": f"{K.OUTBOX}{ts}#{uuid.uuid4().hex[:6]}",
        "kind": kind,
        "to": to,
        "subject": subject,
        "html": html_body,
        "createdAt": ts,
        "ttl": int(time.time()) + 30 * 86400,
    }, K.T_OUTBOX))
    return "outbox"


def _mark_once(ledger_id: str, marker: str) -> bool:
    """True the first time a marker is set (then it exists for 400 days)."""
    return db.put_item(db.stamp({
        "PK": K.ledger_pk(ledger_id),
        "SK": f"{K.SENT}{marker}",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "ttl": int(time.time()) + 400 * 86400,
    }, K.T_SENT), if_absent=True)


# ---- templates ---------------------------------------------------------------------

def _wrap(title: str, intro: str, body: str, ledger_name: str) -> str:
    return f"""<!doctype html><html><body style="margin:0;background:#EEF1EE;padding:24px 12px">
<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#FBFCFA;border:1px solid #D9DDD6;border-radius:16px;padding:28px 26px;color:#17211D">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#2F4D3F">ExpenseTrack Pro · {html.escape(ledger_name)}</p>
<h1 style="margin:0 0 10px;font-family:Georgia,serif;font-size:24px;line-height:1.25">{html.escape(title)}</h1>
<p style="margin:0 0 18px;font-size:15px;line-height:1.5;color:#5C6B64">{intro}</p>
{body}
<p style="margin:22px 0 0"><a href="{APP_URL}" style="display:inline-block;background:#2F4D3F;color:#fff;text-decoration:none;font-weight:bold;font-size:14px;padding:10px 18px;border-radius:10px">Open your ledger</a></p>
<p style="margin:20px 0 0;font-size:12px;color:#8A958F">You get this because email updates are on for your account. Turn them off in the app under Menu → Notifications.</p>
</div></body></html>"""


def _row(label: str, value: str, color: str = "#17211D") -> str:
    return (f'<tr><td style="padding:8px 0;border-bottom:1px solid #E5E9E4;font-size:14px">{html.escape(label)}</td>'
            f'<td style="padding:8px 0;border-bottom:1px solid #E5E9E4;font-size:14px;text-align:right;font-family:Menlo,monospace;color:{color}">{value}</td></tr>')


def render_budget_alert(ledger_name: str, flagged: List[dict], currency: str) -> Tuple[str, str, str]:
    over = [s for s in flagged if s["state"] == "exceeded"]
    if over:
        subject = f"{over[0]['label']} is over budget" if len(flagged) == 1 else f"{len(over)} budget{'s' if len(over) > 1 else ''} over limit"
    else:
        subject = f"{flagged[0]['label']} is close to its budget" if len(flagged) == 1 else f"{len(flagged)} budgets getting close"
    rows = "".join(
        _row(f"{s['label']} · {s['periodLabel']}", f"{rupees(s['spent'], currency)} of {rupees(s['limit'], currency)} ({s['pct']:.0f}%)",
             "#B3492F" if s["state"] == "exceeded" else "#8A5C14")
        for s in flagged
    )
    body = f'<table style="width:100%;border-collapse:collapse">{rows}</table>'
    intro = "Here's where these budgets stand right now."
    text = subject + "\n\n" + "\n".join(f"- {s['label']} ({s['periodLabel']}): {rupees(s['spent'], currency)} of {rupees(s['limit'], currency)}, {s['pct']:.0f}%" for s in flagged)
    return subject, _wrap(subject, intro, body, ledger_name), text


def summary_data(ledger_id: str, month: date) -> dict:
    """Numbers for the summary of `month` (any day in it)."""
    m0, m1 = month_bounds(month)
    p0, p1 = month_bounds(m0 - timedelta(days=1))
    items = expenses_between(ledger_id, m0, m1)
    prev = expenses_between(ledger_id, p0, p1)
    labels, group_names, group_of = _custom(ledger_id)
    by_cat = _sum_by_cat(items)
    by_group: Dict[str, float] = defaultdict(float)
    cat_group = {c: g["id"] for g in GROUPS.values() for c in g["categories"]}
    cat_group.update(group_of)
    for cat, amt in by_cat.items():
        gid = cat_group.get(cat, "other")
        by_group[GROUPS.get(gid, {}).get("name") or group_names.get(gid) or "Other"] += amt
    total = sum(by_cat.values())
    prev_total = sum(float(e["amount"]) for e in prev)
    biggest = max(items, key=lambda e: float(e["amount"]), default=None)
    return {
        "month": m0,
        "total": total,
        "count": len(items),
        "prevTotal": prev_total,
        "topGroups": sorted(by_group.items(), key=lambda kv: -kv[1])[:5],
        "biggest": biggest and {"description": biggest.get("description"), "amount": float(biggest["amount"]),
                                "category": category_label(biggest["category"], labels)},
        "budgets": [s for s in budget_statuses(ledger_id, m1) if not s["yearly"]],
    }


def render_summary(ledger_name: str, d: dict, currency: str) -> Tuple[str, str, str]:
    month_name = d["month"].strftime("%B %Y")
    subject = f"Your {month_name} summary: {rupees(d['total'], currency)} spent"
    change = ""
    if d["prevTotal"] > 0:
        pct = (d["total"] - d["prevTotal"]) / d["prevTotal"] * 100
        word = "more" if pct > 0 else "less"
        change = f" That's {abs(pct):.0f}% {word} than the month before ({rupees(d['prevTotal'], currency)})."
    intro = f"{d['count']} expenses in {month_name}, {rupees(d['total'], currency)} in all.{change}"
    groups = "".join(_row(name, rupees(amt, currency)) for name, amt in d["topGroups"])
    body = f'<h2 style="font-size:15px;margin:0 0 6px">Where it went</h2><table style="width:100%;border-collapse:collapse">{groups}</table>'
    if d["budgets"]:
        over = [b for b in d["budgets"] if b["state"] == "exceeded"]
        lines = "".join(
            _row(b["label"], f"{b['pct']:.0f}%", "#B3492F" if b["state"] == "exceeded" else "#8A5C14" if b["state"] == "warning" else "#2F4D3F")
            for b in d["budgets"][:6]
        )
        head = f"{len(over)} over limit" if over else "all within limits"
        body += f'<h2 style="font-size:15px;margin:20px 0 6px">Budgets · {head}</h2><table style="width:100%;border-collapse:collapse">{lines}</table>'
    if d["biggest"]:
        b = d["biggest"]
        body += (f'<p style="margin:18px 0 0;font-size:14px;color:#5C6B64">Biggest single expense: '
                 f'<b style="color:#17211D">{html.escape(b["description"] or b["category"])}</b>, {rupees(b["amount"], currency)}.</p>')
    text = subject + "\n\n" + intro + "\n\n" + "\n".join(f"- {n}: {rupees(a, currency)}" for n, a in d["topGroups"])
    return subject, _wrap(f"{month_name} at a glance", intro, body, ledger_name), text


# ---- jobs ------------------------------------------------------------------------

def _ledger_basics(ledger_id: str) -> Tuple[str, str]:
    meta = L.get_meta(ledger_id) or {}
    settings = db.public(db.get_item(K.ledger_pk(ledger_id), K.SETTINGS) or {})
    return meta.get("name", "Household"), settings.get("currency", "INR")


def _unmark(ledger_id: str, markers: List[str]) -> None:
    for m in markers:
        db.delete_item(K.ledger_pk(ledger_id), f"{K.SENT}{m}")


def check_budget_alerts(ledger_id: str, as_of: Optional[date] = None) -> str:
    as_of = as_of or ist_today()
    flagged, markers = [], []
    for s in budget_statuses(ledger_id, as_of):
        if s["state"] == "ok":
            continue
        marker = f"budget#{s['key']}#{s['period']}#{s['state']}"
        if _mark_once(ledger_id, marker):
            flagged.append(s)
            markers.append(marker)
    if not flagged:
        return "nothing-new"
    try:
        name, currency = _ledger_basics(ledger_id)
        subject, html_body, text = render_budget_alert(name, flagged, currency)
        to = [r["email"] for r in recipients(ledger_id, "notifyBudgetAlerts")]
        return deliver(ledger_id, "budget-alert", to, subject, html_body, text)
    except Exception:
        _unmark(ledger_id, markers)  # try again on the next run
        raise


def send_monthly_summary(ledger_id: str, month: date) -> str:
    """Summary of `month` (normally last month)."""
    marker = f"summary#{month.strftime('%Y-%m')}"
    if not _mark_once(ledger_id, marker):
        return "already-sent"
    try:
        d = summary_data(ledger_id, month)
        if d["count"] == 0:
            return "empty-month"
        name, currency = _ledger_basics(ledger_id)
        subject, html_body, text = render_summary(name, d, currency)
        to = [r["email"] for r in recipients(ledger_id, "notifyMonthlySummary")]
        return deliver(ledger_id, "monthly-summary", to, subject, html_body, text)
    except Exception:
        _unmark(ledger_id, [marker])
        raise


def all_ledger_ids() -> List[str]:
    return [i["id"] for i in db.query_index(db.GSI1, K.ALL_LEDGERS)]
