from conftest import expense, user, with_ledger


def me(client, h):
    r = client.get("/me", headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def test_first_sign_in_creates_personal_household(client, priya):
    data = me(client, priya)
    assert data["email"] == "priya@example.com"
    assert len(data["ledgers"]) == 1
    led = data["ledgers"][0]
    assert led["role"] == "owner" and led["isPersonal"] and led["name"] == "Priya's household"
    assert data["defaultLedgerId"] == led["id"]
    # idempotent
    assert me(client, priya)["ledgers"] == data["ledgers"]


def test_data_is_scoped_to_the_household(client, priya, raj):
    client.post("/expenses", headers=priya, json=expense())
    assert len(client.get("/expenses", headers=priya).json()) == 1
    assert client.get("/expenses", headers=raj).json() == []


def test_invite_accept_and_roles(client, priya, raj):
    lid = me(client, priya)["defaultLedgerId"]
    p = with_ledger(priya, lid)
    r = client.post(f"/ledgers/{lid}/invites", headers=priya, json={"email": "RAJ@example.com", "role": "viewer"})
    assert r.status_code == 201, r.text

    # Raj sees the invite, can't use the ledger yet
    raj_me = me(client, raj)
    assert [i["ledgerId"] for i in raj_me["invites"]] == [lid]
    assert client.get("/expenses", headers=with_ledger(raj, lid)).status_code == 403

    r = client.post(f"/invites/{lid}/accept", headers=raj)
    assert r.status_code == 200 and r.json()["role"] == "viewer"
    r_h = with_ledger(raj, lid)
    client.post("/expenses", headers=p, json=expense(amount=100))
    assert len(client.get("/expenses", headers=r_h).json()) == 1
    # viewers can't write
    assert client.post("/expenses", headers=r_h, json=expense()).status_code == 403
    # ...but can save their own theme
    r = client.put("/settings", headers=r_h, json={"currency": "USD", "dateFormat": "DD/MM/YYYY", "theme": "dark", "locale": "en-IN", "yearStart": "apr"})
    assert r.status_code == 200
    assert r.json()["theme"] == "dark" and r.json()["currency"] == "INR" and r.json()["yearStart"] == "jan"

    # promote to editor -> can write
    assert client.put(f"/ledgers/{lid}/members/raj", headers=priya, json={"role": "editor"}).status_code == 200
    assert client.post("/expenses", headers=r_h, json=expense()).status_code == 201
    created = client.get("/expenses", headers=p).json()
    assert {e.get("createdByName") for e in created} == {"Priya Sharma", "Raj Sharma"}

    # editors can't manage members
    assert client.post(f"/ledgers/{lid}/invites", headers=raj, json={"email": "x@y.z"}).status_code == 403
    members = client.get(f"/ledgers/{lid}/members", headers=raj).json()
    assert [m["role"] for m in members] == ["owner", "editor"]


def test_wrong_email_cannot_accept(client, priya, raj):
    lid = me(client, priya)["defaultLedgerId"]
    client.post(f"/ledgers/{lid}/invites", headers=priya, json={"email": "someone@else.com"})
    assert client.post(f"/invites/{lid}/accept", headers=raj).status_code == 404


def test_transfer_ownership_then_leave(client, priya, raj):
    lid = me(client, priya)["defaultLedgerId"]
    client.post(f"/ledgers/{lid}/invites", headers=priya, json={"email": "raj@example.com"})
    client.post(f"/invites/{lid}/accept", headers=raj)
    assert client.delete(f"/ledgers/{lid}/members/priya", headers=priya).status_code == 409  # owner can't leave
    assert client.put(f"/ledgers/{lid}/members/raj", headers=priya, json={"role": "owner"}).status_code == 200
    roles = {m["userId"]: m["role"] for m in client.get(f"/ledgers/{lid}/members", headers=raj).json()}
    assert roles == {"raj": "owner", "priya": "editor"}
    assert client.delete(f"/ledgers/{lid}/members/priya", headers=priya).status_code == 204
    # Priya still has... a fresh personal household? No: hers was this one.
    data = me(client, priya)
    assert lid not in [l["id"] for l in data["ledgers"]]
    assert len(data["ledgers"]) == 1


def test_create_rename_delete_extra_household(client, priya):
    r = client.post("/ledgers", headers=priya, json={"name": "Goa trip"})
    assert r.status_code == 201
    lid = r.json()["id"]
    h = with_ledger(priya, lid)
    client.post("/expenses", headers=h, json=expense())
    assert client.patch(f"/ledgers/{lid}", headers=priya, json={"name": "Goa 2026"}).json()["name"] == "Goa 2026"
    assert len(me(client, priya)["ledgers"]) == 2
    assert client.delete(f"/ledgers/{lid}", headers=priya).status_code == 204
    assert len(me(client, priya)["ledgers"]) == 1
    personal = me(client, priya)["defaultLedgerId"]
    assert client.delete(f"/ledgers/{personal}", headers=priya).status_code == 409


def test_preferences(client, priya):
    r = client.put("/me/preferences", headers=priya, json={"notifyMonthlySummary": False})
    assert r.json() == {"notifyBudgetAlerts": True, "notifyMonthlySummary": False, "defaultLedgerId": me(client, priya)["defaultLedgerId"]}
    assert client.put("/me/preferences", headers=priya, json={"defaultLedgerId": "nope"}).status_code == 400


def test_unknown_ledger_header_is_forbidden(client, priya):
    assert client.get("/expenses", headers=with_ledger(priya, "someone-elses")).status_code == 403


def test_unverified_email_cannot_see_or_take_invites(client, priya):
    lid = me(client, priya)["defaultLedgerId"]
    client.post(f"/ledgers/{lid}/invites", headers=priya, json={"email": "mom@example.com"})
    mallory = {**user("mallory", "mom@example.com", "Mallory"), "X-Local-Email-Verified": "false"}
    assert me(client, mallory)["invites"] == []
    assert client.post(f"/invites/{lid}/accept", headers=mallory).status_code == 403
    mom = user("mom", "mom@example.com", "Mom")
    assert [i["ledgerId"] for i in me(client, mom)["invites"]] == [lid]
    assert client.post(f"/invites/{lid}/accept", headers=mom).status_code == 200


def test_member_refresh_does_not_undo_removal(client, priya, raj):
    from services import ledgers as L
    from dependencies.auth import Identity
    lid = me(client, priya)["defaultLedgerId"]
    client.post(f"/ledgers/{lid}/invites", headers=priya, json={"email": "raj@example.com"})
    client.post(f"/invites/{lid}/accept", headers=raj)
    stale = L.memberships("raj")  # read before the removal
    client.delete(f"/ledgers/{lid}/members/raj", headers=priya)
    import unittest.mock as um
    with um.patch.object(L, "memberships", return_value=stale):
        L.ensure_user(Identity(user_id="raj", email="raj@example.com", name="Raj S (renamed)", email_verified=True))
    assert L.get_member(lid, "raj") is None


def test_leaving_twice_converges_on_one_new_household(client, priya, raj):
    lid = me(client, priya)["defaultLedgerId"]
    client.post(f"/ledgers/{lid}/invites", headers=priya, json={"email": "raj@example.com"})
    client.post(f"/invites/{lid}/accept", headers=raj)
    client.put(f"/ledgers/{lid}/members/raj", headers=priya, json={"role": "owner"})
    client.delete(f"/ledgers/{lid}/members/priya", headers=priya)
    a = me(client, priya)["ledgers"]
    b = me(client, priya)["ledgers"]
    assert len(a) == 1 and a == b and a[0]["id"] != lid
