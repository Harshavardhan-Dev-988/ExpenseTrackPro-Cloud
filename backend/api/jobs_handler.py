"""Scheduled jobs (EventBridge rules in cdk/stacks/api_stack.py call this
Lambda with {"job": "<name>"}):

  recurring        daily 00:30 IST  log recurring expenses that fell due
  budget_alerts    daily 20:00 IST  email budgets that crossed a threshold
  monthly_summary  1st, 09:00 IST   last month's summary per household

Every job is safe to re-run: recurring expenses use deterministic ids with
conditional writes, and emails are guarded by SENT# markers.
"""
import logging
from datetime import timedelta

from services import notify as N
from services import recurring as R

log = logging.getLogger()
log.setLevel(logging.INFO)


def handler(event, _context=None):
    job = (event or {}).get("job")
    if job == "recurring":
        logged = R.run_all()
        log.info("recurring: logged %s expenses", logged)
        return {"job": job, "logged": logged}

    if job in ("budget_alerts", "monthly_summary"):
        results = {}
        last_month = N.ist_today().replace(day=1) - timedelta(days=1)
        for ledger_id in N.all_ledger_ids():
            try:
                if job == "budget_alerts":
                    results[ledger_id] = N.check_budget_alerts(ledger_id)
                else:
                    results[ledger_id] = N.send_monthly_summary(ledger_id, last_month)
            except Exception:  # one household's failure mustn't stop the rest
                log.exception("%s failed for %s", job, ledger_id)
                results[ledger_id] = "error"
        log.info("%s: %s", job, results)
        return {"job": job, "results": results}

    raise ValueError(f"Unknown job {job!r}")
