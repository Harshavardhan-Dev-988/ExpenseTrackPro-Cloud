from conftest import expense, with_ledger


def test_balances_and_settle(client, priya, raj):
    lid = client.get("/me", headers=priya).json()["defaultLedgerId"]
    client.post(f"/ledgers/{lid}/invites", headers=priya, json={"email": "raj@example.com"})
    client.post(f"/invites/{lid}/accept", headers=raj)
    p, r = with_ledger(priya, lid), with_ledger(raj, lid)

    # Priya pays 900 dinner split 3 ways with Raj and Asha
    client.post("/expenses", headers=p, json=expense(amount=900, paidBy="m:priya", split={"shares": [
        {"person": "m:priya", "amount": 300}, {"person": "m:raj", "amount": 300}, {"person": "n:Asha", "amount": 300}]}))
    # Raj pays 400 cab split with Priya
    client.post("/expenses", headers=r, json=expense(amount=400, category="public_transport", paidBy="m:raj", split={"shares": [
        {"person": "m:priya", "amount": 200}, {"person": "m:raj", "amount": 200}]}))
    # unsplit expense is ignored
    client.post("/expenses", headers=p, json=expense(amount=1000))

    b = client.get("/splits/balances", headers=p).json()
    net = {x["ref"]: x["net"] for x in b["people"]}
    assert net == {"m:priya": 400, "m:raj": -100, "n:Asha": -300}
    assert b["splitExpenses"] == 2
    names = {x["ref"]: x["name"] for x in b["people"]}
    assert names["m:raj"] == "Raj Sharma" and names["n:Asha"] == "Asha"
    assert sorted((t["fromPerson"], t["toPerson"], t["amount"]) for t in b["transfers"]) == [
        ("m:raj", "m:priya", 100), ("n:Asha", "m:priya", 300)]

    s = client.post("/splits/settlements", headers=r, json={"fromPerson": "m:raj", "toPerson": "m:priya", "amount": 100, "date": "2026-11-10T00:00:00Z"})
    assert s.status_code == 201
    b = client.get("/splits/balances", headers=p).json()
    assert {x["ref"]: x["net"] for x in b["people"]} == {"m:priya": 300, "n:Asha": -300}
    assert client.delete(f"/splits/settlements/{s.json()['id']}", headers=p).status_code == 204

    # editing an expense to remove its split drops it from balances
    eid = [e for e in client.get("/expenses", headers=p).json() if e["amount"] == 400][0]["id"]
    client.put(f"/expenses/{eid}", headers=r, json={"split": None})
    b = client.get("/splits/balances", headers=p).json()
    assert b["splitExpenses"] == 1


def test_settlement_validation(client, priya):
    bad = {"fromPerson": "m:priya", "toPerson": "m:priya", "amount": 10, "date": "2026-11-10T00:00:00Z"}
    assert client.post("/splits/settlements", headers=priya, json=bad).status_code == 400
