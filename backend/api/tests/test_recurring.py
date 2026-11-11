from datetime import date

import pytest

from conftest import with_ledger
from services import recurring as R


def rule(**kw):
    base = {"description": "Rent", "amount": 18000, "category": "rent_mortgage", "frequency": "monthly",
            "dayOfMonth": 5, "startDate": "2026-11-01", "autoLog": True}
    return {**base, **kw}


@pytest.mark.parametrize("r,expected", [
    ({"frequency": "monthly", "dayOfMonth": 5, "startDate": "2026-11-01"}, "2026-11-05"),
    ({"frequency": "monthly", "dayOfMonth": 5, "startDate": "2026-11-06"}, "2026-12-05"),
    ({"frequency": "monthly", "dayOfMonth": 31, "startDate": "2027-02-01"}, "2027-02-28"),
    ({"frequency": "weekly", "weekday": 0, "startDate": "2026-11-11"}, "2026-11-16"),
    ({"frequency": "yearly", "dayOfMonth": 15, "startDate": "2026-06-01"}, "2026-06-15"),
])
def test_first_due(r, expected):
    assert R.first_due(r).isoformat() == expected


def test_next_after_steps_and_clamps():
    r = {"frequency": "monthly", "dayOfMonth": 31, "startDate": "2026-01-01"}
    assert R.next_after(r, date(2026, 1, 31)).isoformat() == "2026-02-28"
    assert R.next_after(r, date(2026, 2, 28)).isoformat() == "2026-03-31"
    q = {"frequency": "quarterly", "dayOfMonth": 10, "startDate": "2026-01-01"}
    assert R.next_after(q, date(2026, 1, 10)).isoformat() == "2026-04-10"


def test_create_and_auto_log_catch_up(client, priya, monkeypatch):
    monkeypatch.setattr(R, "today", lambda: date(2026, 11, 1))
    r = client.post("/recurring", headers=priya, json=rule()).json()
    assert r["nextDue"] == "2026-11-05"
    # three months later, nothing ran in between
    monkeypatch.setattr(R, "today", lambda: date(2027, 1, 20))
    res = client.post("/recurring/run", headers=priya).json()
    assert res["logged"] == 3
    exps = client.get("/expenses", headers=priya).json()
    assert sorted(e["id"] for e in exps) == [f"r-{r['id']}-2026-11-05", f"r-{r['id']}-2026-12-05", f"r-{r['id']}-2027-01-05"]
    assert all(e["recurringId"] == r["id"] for e in exps)
    # re-running never duplicates
    assert client.post("/recurring/run", headers=priya).json()["logged"] == 0
    assert client.get("/recurring", headers=priya).json()[0]["nextDue"] == "2027-02-05"


def test_manual_rule_waits_then_log_or_skip(client, priya, monkeypatch):
    monkeypatch.setattr(R, "today", lambda: date(2026, 11, 1))
    r = client.post("/recurring", headers=priya, json=rule(autoLog=False, description="Maid", amount=6000)).json()
    monkeypatch.setattr(R, "today", lambda: date(2026, 11, 6))
    res = client.post("/recurring/run", headers=priya).json()
    assert res["logged"] == 0 and res["due"][0]["dates"] == ["2026-11-05"]
    e = client.post(f"/recurring/{r['id']}/log", headers=priya, json={"due": "2026-11-05"})
    assert e.status_code == 200 and e.json()["amount"] == 6000
    assert client.post(f"/recurring/{r['id']}/log", headers=priya, json={"due": "2026-11-05"}).status_code == 409
    assert client.get("/recurring", headers=priya).json()[0]["nextDue"] == "2026-12-05"
    monkeypatch.setattr(R, "today", lambda: date(2026, 12, 7))
    assert client.post(f"/recurring/{r['id']}/skip", headers=priya, json={"due": "2026-12-05"}).json()["nextDue"] == "2027-01-05"
    assert len(client.get("/expenses", headers=priya).json()) == 1


def test_end_date_deactivates(client, priya, monkeypatch):
    monkeypatch.setattr(R, "today", lambda: date(2026, 11, 1))
    r = client.post("/recurring", headers=priya, json=rule(endDate="2026-12-31")).json()
    monkeypatch.setattr(R, "today", lambda: date(2027, 3, 1))
    assert client.post("/recurring/run", headers=priya).json()["logged"] == 2
    got = client.get("/recurring", headers=priya).json()[0]
    assert got["active"] is False and "nextDue" not in got


def test_daily_job_finds_due_rules_across_households(client, priya, raj, monkeypatch):
    monkeypatch.setattr(R, "today", lambda: date(2026, 11, 1))
    client.post("/recurring", headers=priya, json=rule())
    client.post("/recurring", headers=raj, json=rule(description="School fees", dayOfMonth=3, amount=25000))
    assert R.run_all(date(2026, 11, 4)) == 1      # only Raj's (3rd) is due
    assert R.run_all(date(2026, 11, 5)) == 1      # now Priya's
    assert R.run_all(date(2026, 11, 5)) == 0      # idempotent


def test_viewer_cannot_create(client, priya, raj):
    lid = client.get("/me", headers=priya).json()["defaultLedgerId"]
    client.post(f"/ledgers/{lid}/invites", headers=priya, json={"email": "raj@example.com", "role": "viewer"})
    client.post(f"/invites/{lid}/accept", headers=raj)
    assert client.post("/recurring", headers=with_ledger(raj, lid), json=rule()).status_code == 403
    assert client.post("/recurring/run", headers=with_ledger(raj, lid)).status_code == 200


def test_resume_does_not_backfill_and_edit_does_not_skip(client, priya, monkeypatch):
    monkeypatch.setattr(R, "today", lambda: date(2026, 1, 10))
    r = client.post("/recurring", headers=priya, json=rule(description="Gym", amount=1500, startDate="2026-01-01")).json()
    client.put(f"/recurring/{r['id']}", headers=priya, json={"active": False})
    monkeypatch.setattr(R, "today", lambda: date(2026, 6, 20))
    got = client.put(f"/recurring/{r['id']}", headers=priya, json={"active": True}).json()
    assert got["nextDue"] == "2026-07-05"
    assert client.post("/recurring/run", headers=priya).json()["logged"] == 0
    # change the day to the 1st: the next 1st after today, not after the old due date
    monkeypatch.setattr(R, "today", lambda: date(2026, 11, 11))
    r2 = client.post("/recurring", headers=priya, json=rule()).json()
    assert r2["nextDue"] == "2026-12-05"
    assert client.put(f"/recurring/{r2['id']}", headers=priya, json={"dayOfMonth": 1}).json()["nextDue"] == "2026-12-01"


def test_deleted_rule_is_not_resurrected_by_the_job(client, priya, monkeypatch):
    monkeypatch.setattr(R, "today", lambda: date(2026, 11, 1))
    r = client.post("/recurring", headers=priya, json=rule()).json()
    item = R.rules(client.get("/me", headers=priya).json()["defaultLedgerId"])[0]
    client.delete(f"/recurring/{r['id']}", headers=priya)
    R.advance(item["PK"].split("#", 1)[1], item, date(2026, 11, 5))  # a stale run
    assert client.get("/recurring", headers=priya).json() == []
