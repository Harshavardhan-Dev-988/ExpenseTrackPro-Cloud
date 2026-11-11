from conftest import expense


def test_crud_and_clear_field(client, priya):
    r = client.post("/expenses", headers=priya, json=expense(receiptUrl="receipts/x/1.jpg", paymentMethod="upi"))
    assert r.status_code == 201
    e = r.json()
    assert e["createdBy"] == "priya"
    r = client.put(f"/expenses/{e['id']}", headers=priya, json={"receiptUrl": None, "amount": 500})
    assert r.status_code == 200
    body = r.json()
    assert body["amount"] == 500 and "receiptUrl" not in body and body["paymentMethod"] == "upi"
    assert client.delete(f"/expenses/{e['id']}", headers=priya).status_code == 204
    assert client.delete(f"/expenses/{e['id']}", headers=priya).status_code == 404


def test_date_range_query_uses_index(client, priya):
    for d in ("2026-03-31", "2026-04-01", "2026-04-15", "2026-05-01"):
        client.post("/expenses", headers=priya, json=expense(date=f"{d}T12:00:00+05:30", description=d))
    got = client.get("/expenses?start=2026-04-01&end=2026-04-30", headers=priya).json()
    assert sorted(e["description"] for e in got) == ["2026-04-01", "2026-04-15"]
    assert len(client.get("/expenses", headers=priya).json()) == 4


def test_batch_create_and_delete(client, priya):
    items = [expense(amount=i + 1, description=f"e{i}") for i in range(60)]
    r = client.post("/expenses/batch", headers=priya, json={"items": items})
    assert r.status_code == 201 and len(r.json()) == 60
    ids = [e["id"] for e in r.json()]
    assert client.post("/expenses/batch", headers=priya, json={"items": items * 2}).status_code == 400
    assert client.post("/expenses/batch-delete", headers=priya, json={"ids": ids[:50]}).status_code == 204
    assert len(client.get("/expenses", headers=priya).json()) == 10


def test_split_validation(client, priya):
    bad = expense(amount=900, split={"shares": [{"person": "m:priya", "amount": 300}, {"person": "n:Asha", "amount": 300}]})
    assert client.post("/expenses", headers=priya, json=bad).status_code == 400
    dup = expense(amount=600, split={"shares": [{"person": "n:Asha", "amount": 300}, {"person": "n:Asha", "amount": 300}]})
    assert client.post("/expenses", headers=priya, json=dup).status_code == 400
    ok = expense(amount=600, split={"shares": [{"person": "m:priya", "amount": 300}, {"person": "n:Asha", "amount": 300}]})
    r = client.post("/expenses", headers=priya, json=ok)
    assert r.status_code == 201 and r.json()["paidBy"] == "m:priya"


def test_budgets_settings_savings_categories(client, priya):
    b = {"category": "group:dining", "monthlyLimit": 9000, "budgetType": "monthly", "alertThreshold": 80, "isActive": True}
    assert client.put("/budgets/group:dining", headers=priya, json=b).status_code == 200
    assert client.get("/budgets", headers=priya).json()[0]["monthlyLimit"] == 9000
    s = client.put("/settings", headers=priya, json={"currency": "INR", "dateFormat": "DD/MM/YYYY", "theme": "dark", "locale": "en-IN", "yearStart": "apr"}).json()
    assert s["yearStart"] == "apr" and s["theme"] == "dark"
    assert client.get("/settings", headers=priya).json() == s
    r = client.post("/savings/entries", headers=priya, json={"date": "2026-04-02T00:00:00Z", "amount": 5000, "category": "ppf", "description": "PPF"})
    assert r.status_code == 201
    assert client.post("/savings/goals", headers=priya, json={"name": "Car", "targetAmount": 500000, "category": "vehicle"}).status_code == 201
    client.put("/categories/groups/cg_pets", headers=priya, json={"id": "cg_pets", "name": "Pets"})
    client.put("/categories/items/custom_vet", headers=priya, json={"id": "custom_vet", "label": "Vet", "groupId": "cg_pets"})
    assert client.delete("/categories/groups/cg_pets", headers=priya).status_code == 409
    c = client.get("/categories", headers=priya).json()
    assert len(c["groups"]) == 1 and len(c["categories"]) == 1
