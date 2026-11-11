import db
import migrations
from services import ledgers as L


def seed_v1():
    t = db.table("etp-v1")
    items = [
        {"PK": "USER#u1", "SK": "EXPENSE#e1", "id": "e1", "date": "2026-10-03T10:00:00+05:30", "amount": 450,
         "category": "dine_out", "description": "Dinner", "receiptUrl": "receipts/u1/a.jpg",
         "createdAt": "2026-10-03T10:00:00Z", "updatedAt": "2026-10-03T10:00:00Z"},
        {"PK": "USER#u1", "SK": "BUDGET#grocery", "category": "grocery", "monthlyLimit": 13000, "budgetType": "monthly",
         "alertThreshold": 80, "isActive": True},
        {"PK": "USER#u1", "SK": "SETTINGS", "currency": "INR", "dateFormat": "DD/MM/YYYY", "theme": "dark", "locale": "en-IN"},
        {"PK": "USER#u1", "SK": "CATEGORY#custom_vet", "id": "custom_vet", "label": "Vet", "groupId": "financial_other"},
        {"PK": "USER#u1", "SK": "SAVINGS_ENTRY#s1", "id": "s1", "date": "2026-09-01T00:00:00Z", "amount": 5000,
         "category": "ppf", "description": "PPF", "createdAt": "2026-09-01T00:00:00Z", "updatedAt": "2026-09-01T00:00:00Z"},
        {"PK": "USER#u1", "SK": "WHATSAPP_LINK", "phoneNumber": "+919876543210"},
        {"PK": "WHATSAPP#+919876543210", "SK": "LINK", "userId": "u1"},
        {"PK": "LINKCODE#ABC123", "SK": "PENDING", "userId": "u1", "ttl": 1},
        {"PK": "USER#u2", "SK": "EXPENSE#e2", "id": "e2", "date": "2026-10-04T10:00:00+05:30", "amount": 99,
         "category": "grocery", "description": "Milk", "createdAt": "2026-10-04T10:00:00Z", "updatedAt": "2026-10-04T10:00:00Z"},
    ]
    from decimal import Decimal
    for i in items:
        t.put_item(Item={k: (Decimal(str(v)) if isinstance(v, (int, float)) and not isinstance(v, bool) else v) for k, v in i.items()})


def test_migration_moves_everything_once(client):
    seed_v1()
    results = migrations.run_pending()
    assert results[0]["id"] == "001"
    assert results[0]["users"] == 2 and results[0]["expenses"] == 2 and results[0]["phoneLinks"] == 1
    assert migrations.run_pending() == []  # recorded, never re-runs

    h = {"X-Local-User-Id": "u1", "X-Local-User-Email": "u1@example.com", "X-Local-User-Name": "Priya Sharma"}
    me = client.get("/me", headers=h).json()
    lid = L.personal_ledger_id("u1")
    assert me["defaultLedgerId"] == lid and me["ledgers"][0]["role"] == "owner"
    assert me["ledgers"][0]["name"] == "Priya's household"  # renamed once the name is known
    exps = client.get("/expenses", headers=h).json()
    assert [e["id"] for e in exps] == ["e1"] and exps[0]["createdBy"] == "u1"
    assert client.get("/expenses?start=2026-10-01&end=2026-10-31", headers=h).json()[0]["id"] == "e1"
    assert client.get("/budgets", headers=h).json()[0]["monthlyLimit"] == 13000
    s = client.get("/settings", headers=h).json()
    assert s["theme"] == "dark" and s["currency"] == "INR" and s["yearStart"] == "jan"
    assert client.get("/categories", headers=h).json()["categories"][0]["label"] == "Vet"
    assert len(client.get("/savings/entries", headers=h).json()) == 1
    assert client.get("/whatsapp/status", headers=h).json() == {"linked": True, "phoneNumber": "+919876543210"}
    assert db.get_item("PHONE#+919876543210", "LINK")["userId"] == "u1"
    assert db.get_item("LINKCODE#ABC123", "PENDING") is None
    # old receipt keys remain viewable through the migrated household
    meta = L.get_meta(lid)
    assert meta["legacyReceiptPrefix"] == "receipts/u1/"
    # u2 sees only their own
    assert [e["id"] for e in client.get("/expenses", headers={"X-Local-User-Id": "u2"}).json()] == ["e2"]


def test_migration_without_legacy_table_fails_and_is_not_recorded(client, monkeypatch):
    import pytest
    monkeypatch.delenv("LEGACY_TABLE_NAME")
    with pytest.raises(RuntimeError):
        migrations.run_pending()
    assert migrations.applied() == {}


def test_migration_never_overwrites_v2_changes(client):
    seed_v1()
    h = {"X-Local-User-Id": "u1", "X-Local-User-Email": "u1@example.com", "X-Local-User-Name": "Priya Sharma"}
    # The user signs in and changes things before the copy runs.
    client.get("/me", headers=h)
    client.put("/me/preferences", headers=h, json={"notifyMonthlySummary": False})
    client.put("/budgets/grocery", headers=h, json={"category": "grocery", "monthlyLimit": 20000, "budgetType": "monthly", "alertThreshold": 80, "isActive": True})
    migrations.run_pending()
    assert client.get("/budgets", headers=h).json()[0]["monthlyLimit"] == 20000
    me = client.get("/me", headers=h).json()
    assert me["preferences"]["notifyMonthlySummary"] is False
    assert client.get("/settings", headers=h).json()["theme"] == "dark"  # migrated pref filled in
    assert len(client.get("/expenses", headers=h).json()) == 1
