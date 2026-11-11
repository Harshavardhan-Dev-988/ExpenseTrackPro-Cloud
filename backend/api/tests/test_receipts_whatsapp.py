from conftest import with_ledger
from services import ledgers as L


def test_receipts_scoped_to_household(client, priya, raj):
    import boto3
    boto3.client("s3").create_bucket(Bucket="receipts-test", CreateBucketConfiguration={"LocationConstraint": "ap-southeast-2"})
    lid = client.get("/me", headers=priya).json()["defaultLedgerId"]
    up = client.post("/receipts/upload-url", headers=priya, json={"contentType": "image/jpeg"}).json()
    assert up["key"].startswith(f"receipts/{lid}/")
    assert client.get(f"/receipts/view-url?key={up['key']}", headers=priya).status_code == 200
    assert client.get(f"/receipts/view-url?key={up['key']}", headers=raj).status_code == 403
    client.post(f"/ledgers/{lid}/invites", headers=priya, json={"email": "raj@example.com", "role": "viewer"})
    client.post(f"/invites/{lid}/accept", headers=raj)
    r = with_ledger(raj, lid)
    assert client.get(f"/receipts/view-url?key={up['key']}", headers=r).status_code == 200
    assert client.post("/receipts/upload-url", headers=r, json={"contentType": "image/jpeg"}).status_code == 403
    assert client.get(f"/receipts/view-url?key=receipts/{lid}/../x.jpg", headers=r).status_code == 403


def test_whatsapp_logs_into_default_household(client, priya, monkeypatch):
    import routers.whatsapp as W
    monkeypatch.setattr(W, "_verify_twilio_signature", lambda request, form: True)
    code = client.post("/whatsapp/link-code", headers=priya).json()["code"]
    form = {"From": "whatsapp:+919876543210", "Body": f"LINK {code}"}
    assert "linked" in client.post("/whatsapp/webhook", data=form).text
    assert client.get("/whatsapp/status", headers=priya).json()["linked"]
    assert "Logged" in client.post("/whatsapp/webhook", data={"From": "whatsapp:+919876543210", "Body": "150 auto"}).text
    exps = client.get("/expenses", headers=priya).json()
    assert len(exps) == 1 and exps[0]["category"] == "auto_rickshaw" and exps[0]["createdBy"] == "priya"
    assert L.personal_ledger_id("priya") == client.get("/me", headers=priya).json()["defaultLedgerId"]
