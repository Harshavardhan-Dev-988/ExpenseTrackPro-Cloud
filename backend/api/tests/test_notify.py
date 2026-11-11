from datetime import date

import db
from conftest import expense
from services import notify as N


def setup_budgets(client, h):
    client.put("/budgets/group:dining", headers=h, json={"category": "group:dining", "monthlyLimit": 1000, "budgetType": "monthly", "alertThreshold": 80, "isActive": True})
    client.put("/budgets/medical_insurance", headers=h, json={"category": "medical_insurance", "yearlyLimit": 60000, "budgetType": "yearly", "alertThreshold": 80, "isActive": True})


def test_budget_status_monthly_group_and_yearly_fy(client, priya):
    lid = client.get("/me", headers=priya).json()["defaultLedgerId"]
    setup_budgets(client, priya)
    client.put("/settings", headers=priya, json={"currency": "INR", "dateFormat": "DD/MM/YYYY", "theme": "system", "locale": "en-IN", "yearStart": "apr"})
    client.post("/expenses", headers=priya, json=expense(amount=600, category="dine_out"))
    client.post("/expenses", headers=priya, json=expense(amount=300, category="ecommerce_zomato"))
    client.post("/expenses", headers=priya, json=expense(amount=24000, category="medical_insurance", date="2026-06-10T10:00:00+05:30"))
    client.post("/expenses", headers=priya, json=expense(amount=30000, category="medical_insurance", date="2026-03-10T10:00:00+05:30"))  # previous FY
    st = {s["key"]: s for s in N.budget_statuses(lid, date(2026, 11, 20))}
    assert st["group:dining"]["spent"] == 900 and st["group:dining"]["state"] == "warning"
    assert st["medical_insurance"]["spent"] == 24000 and st["medical_insurance"]["state"] == "ok"
    assert st["medical_insurance"]["periodLabel"] == "FY 2026–27"


def test_alert_goes_to_outbox_once_and_respects_prefs(client, priya):
    lid = client.get("/me", headers=priya).json()["defaultLedgerId"]
    setup_budgets(client, priya)
    client.post("/expenses", headers=priya, json=expense(amount=900, category="dine_out"))
    assert N.check_budget_alerts(lid, date(2026, 11, 20)) == "outbox"
    assert N.check_budget_alerts(lid, date(2026, 11, 21)) == "nothing-new"
    box = client.get("/notifications/outbox", headers=priya).json()
    assert len(box) == 1 and box[0]["to"] == ["priya@example.com"] and "close to its budget" in box[0]["subject"]
    # crossing 100% is a new state -> new email
    client.post("/expenses", headers=priya, json=expense(amount=200, category="dine_out"))
    client.put("/me/preferences", headers=priya, json={"notifyBudgetAlerts": False})
    assert N.check_budget_alerts(lid, date(2026, 11, 22)) == "no-recipients"


def test_monthly_summary(client, priya):
    lid = client.get("/me", headers=priya).json()["defaultLedgerId"]
    client.post("/expenses", headers=priya, json=expense(amount=1200, category="grocery", date="2026-10-03T10:00:00+05:30"))
    client.post("/expenses", headers=priya, json=expense(amount=800, category="dine_out", date="2026-10-20T10:00:00+05:30"))
    client.post("/expenses", headers=priya, json=expense(amount=1000, category="grocery", date="2026-09-03T10:00:00+05:30"))
    d = N.summary_data(lid, date(2026, 10, 1))
    assert d["total"] == 2000 and d["prevTotal"] == 1000 and d["topGroups"][0] == ("Groceries", 1200)
    assert N.send_monthly_summary(lid, date(2026, 10, 1)) == "outbox"
    assert N.send_monthly_summary(lid, date(2026, 10, 1)) == "already-sent"
    box = client.get("/notifications/outbox", headers=priya).json()
    assert "October 2026 summary: ₹2,000 spent" in box[0]["subject"]
    assert "100% more" in box[0]["html"]
    assert client.get("/notifications/preview/monthly-summary", headers=priya).status_code == 200


def test_rupee_grouping():
    assert N.rupees(1234567) == "₹12,34,567"
    assert N.rupees(999) == "₹999"
    assert N.rupees(100000) == "₹1,00,000"


def test_jobs_handler(client, priya):
    import jobs_handler
    client.get("/me", headers=priya)
    out = jobs_handler.handler({"job": "budget_alerts"})
    assert out["job"] == "budget_alerts" and len(out["results"]) == 1
    assert jobs_handler.handler({"job": "recurring"})["logged"] == 0


def test_catalog_in_sync_with_frontend():
    import subprocess, sys, pathlib
    script = pathlib.Path(__file__).resolve().parents[2] / "scripts" / "gen_catalog.py"
    assert subprocess.run([sys.executable, str(script), "--check"]).returncode == 0, \
        "catalog.json is out of date: run backend/scripts/gen_catalog.py"
