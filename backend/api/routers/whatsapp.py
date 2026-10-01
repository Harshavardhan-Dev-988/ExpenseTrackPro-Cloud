"""WhatsApp expense logging (phase 4).

Twilio calls POST /whatsapp/webhook for every inbound WhatsApp message to
the sandbox (or, later, a real business number) - that route has no Cognito
authorizer (Twilio can't send a JWT), so it authenticates the caller a
different way: verifying Twilio's `X-Twilio-Signature` header, an HMAC-SHA1
of the exact webhook URL plus the sorted POST body, keyed with the Twilio
Auth Token. Without that check this would be an open "create an expense for
any phone number" endpoint - anyone could POST a fake `From` and inject
expenses into a stranger's linked account.

A WhatsApp number is never trusted as identity by itself, even after
verifying the request came from Twilio. Twilio's WhatsApp Sandbox shares one
number across every developer account, so the *sender* is the only thing
that varies - a number is linked to an ExpenseTrack Pro account only by
redeeming a short-lived code minted for a signed-in user (via
POST /whatsapp/link-code, from the app) by texting "LINK <code>" back from
that WhatsApp number. That's the same "prove you control this channel"
pattern as an email verification link, just over WhatsApp instead of email.

Everything except /webhook requires the normal Cognito-authenticated user
(get_user_id) - only the linking flow's *first* half (minting a code) needs
a signed-in browser session; redeeming it happens entirely over WhatsApp.
"""
import base64
import hashlib
import hmac
import os
import re
import secrets
import string
import time
import uuid
from datetime import datetime, timezone
from typing import Optional
from xml.sax.saxutils import escape as xml_escape

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel

import db
from dependencies.auth import get_user_id

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])

LINK_CODE_TTL_SECONDS = 15 * 60
LINK_CODE_ALPHABET = string.ascii_uppercase + string.digits
LINK_CODE_LENGTH = 6

# Best-effort keyword -> category guess for a raw WhatsApp text message.
# Not exhaustive - the app has ~80 categories (see frontend's constants.ts)
# and hard-coding all of them here would be exactly the kind of thing that
# drifts out of sync. This covers the categories someone is most likely to
# text about in the moment ("150 auto" right after a rickshaw ride); "other"
# is always the safe fallback, and the category is one tap to fix in-app.
CATEGORY_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("auto_rickshaw", ("auto", "rickshaw")),
    ("public_transport", ("uber", "ola", "cab", "taxi", "bus", "metro", "train")),
    ("fuel", ("petrol", "diesel", "fuel", "pump")),
    ("parking_fees", ("parking",)),
    ("grocery", ("grocer", "supermarket", "mart", "vegetable", "veggies", "sabzi")),
    ("milk_dairy", ("milk", "dairy")),
    ("dine_out", ("restaurant", "dinner", "lunch", "dine")),
    ("coffee_snacks", ("coffee", "cafe", "tea", "snack")),
    ("street_food", ("street food", "chaat", "vendor")),
    ("bills_power", ("electricity", "power bill", "eb bill")),
    ("bills_wifi", ("wifi", "broadband", "internet bill")),
    ("bills_mobile", ("mobile bill", "phone bill")),
    ("mobile_recharge", ("recharge",)),
    ("rent_mortgage", ("rent",)),
    ("shopping_clothes", ("clothes", "clothing", "shirt", "dress")),
    ("shopping_electronics", ("electronics", "gadget")),
    ("entertainment", ("movie", "cinema", "netflix", "concert")),
    ("subscriptions", ("subscription",)),
    ("fitness_gym", ("gym", "fitness")),
    ("medical_medicines", ("medicine", "pharmacy", "chemist")),
    ("medical_consultation", ("doctor", "clinic", "consultation")),
    ("travel_flights", ("flight", "airfare")),
    ("travel_hotels", ("hotel", "lodging")),
]

AMOUNT_RE = re.compile(r"(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d{1,2})?)", re.IGNORECASE)


# ---- Request/response models -----------------------------------------

class LinkCodeResponse(BaseModel):
    code: str
    expiresInSeconds: int
    sandboxNumber: str


class WhatsAppStatusResponse(BaseModel):
    linked: bool
    phoneNumber: Optional[str] = None


# ---- Twilio signature verification -------------------------------------

def _twilio_auth_token() -> str:
    token = os.environ.get("TWILIO_AUTH_TOKEN")
    if not token:
        raise HTTPException(status_code=503, detail="WhatsApp integration isn't configured yet")
    return token


def _verify_twilio_signature(request: Request, form: dict) -> bool:
    signature = request.headers.get("x-twilio-signature")
    if not signature:
        return False
    url = str(request.url)
    data = url + "".join(f"{k}{form[k]}" for k in sorted(form))
    computed = base64.b64encode(
        hmac.new(_twilio_auth_token().encode("utf-8"), data.encode("utf-8"), hashlib.sha1).digest()
    ).decode("utf-8")
    return hmac.compare_digest(computed, signature)


def _twiml(message: str) -> Response:
    body = f'<?xml version="1.0" encoding="UTF-8"?><Response><Message>{xml_escape(message)}</Message></Response>'
    return Response(content=body, media_type="application/xml")


# ---- Parsing --------------------------------------------------------------

def _guess_category(text_lower: str) -> str:
    for category, keywords in CATEGORY_KEYWORDS:
        if any(kw in text_lower for kw in keywords):
            return category
    return "other"


def _parse_expense_message(text: str) -> Optional[dict]:
    """Best-effort parse of a raw WhatsApp text into an expense. Amount is
    the one field that must be right - no amount, no expense (the caller
    replies asking the person to try again rather than logging a zero)."""
    match = AMOUNT_RE.search(text)
    if not match:
        return None
    amount = float(match.group(1))

    description = (text[: match.start()] + text[match.end() :]).strip(" -,.:")
    if not description:
        # Falls back to the raw text per the roadmap's spec - a
        # number-only message ("150") still logs something readable
        # rather than an empty description.
        description = text.strip()

    return {
        "amount": amount,
        "description": description,
        "category": _guess_category(text.lower()),
    }


# ---- Linking (signed-in half) ------------------------------------------

def _link_code_pk(code: str) -> str:
    return f"LINKCODE#{code}"


def _whatsapp_pk(phone_number: str) -> str:
    return f"WHATSAPP#{phone_number}"


@router.post("/link-code", response_model=LinkCodeResponse)
def create_link_code(user_id: str = Depends(get_user_id)):
    code = "".join(secrets.choice(LINK_CODE_ALPHABET) for _ in range(LINK_CODE_LENGTH))
    now = int(time.time())
    db.put_item(
        {
            "PK": _link_code_pk(code),
            "SK": "PENDING",
            "userId": user_id,
            "createdAt": now,
            "ttl": now + LINK_CODE_TTL_SECONDS,
        }
    )
    return LinkCodeResponse(
        code=code,
        expiresInSeconds=LINK_CODE_TTL_SECONDS,
        sandboxNumber=os.environ.get("TWILIO_WHATSAPP_NUMBER", "+17372508034"),
    )


@router.get("/status", response_model=WhatsAppStatusResponse)
def get_status(user_id: str = Depends(get_user_id)):
    link = db.get_item(db.user_pk(user_id), "WHATSAPP_LINK")
    if not link:
        return WhatsAppStatusResponse(linked=False)
    return WhatsAppStatusResponse(linked=True, phoneNumber=link.get("phoneNumber"))


@router.delete("/link", status_code=204)
def unlink(user_id: str = Depends(get_user_id)):
    link = db.get_item(db.user_pk(user_id), "WHATSAPP_LINK")
    if link and link.get("phoneNumber"):
        db.delete_item(_whatsapp_pk(link["phoneNumber"]), "LINK")
    db.delete_item(db.user_pk(user_id), "WHATSAPP_LINK")


# ---- Webhook (Twilio-authenticated half) --------------------------------

@router.post("/webhook")
async def webhook(request: Request):
    form = dict(await request.form())

    if not _verify_twilio_signature(request, form):
        raise HTTPException(status_code=403, detail="Invalid Twilio signature")

    from_field = form.get("From", "")
    phone_number = from_field.replace("whatsapp:", "").strip()
    body = (form.get("Body") or "").strip()

    if not phone_number:
        return _twiml("Couldn't tell who this is from - please try again.")

    link_match = re.match(r"^link\s+([A-Za-z0-9]{4,10})$", body, re.IGNORECASE)
    if link_match:
        code = link_match.group(1).upper()
        code_item = db.get_item(_link_code_pk(code), "PENDING")
        now = int(time.time())
        if not code_item or code_item.get("ttl", 0) < now:
            return _twiml(
                "That code isn't valid or has expired. Get a new one from "
                "ExpenseTrack Pro → Link WhatsApp in the app."
            )
        user_id = code_item["userId"]
        db.put_item({"PK": _whatsapp_pk(phone_number), "SK": "LINK", "userId": user_id})
        db.put_item(
            {"PK": db.user_pk(user_id), "SK": "WHATSAPP_LINK", "phoneNumber": phone_number}
        )
        db.delete_item(_link_code_pk(code), "PENDING")
        return _twiml("✅ This WhatsApp number is now linked to your ExpenseTrack Pro account. Try texting an expense, e.g. ‘150 auto’.")

    link = db.get_item(_whatsapp_pk(phone_number), "LINK")
    if not link:
        return _twiml(
            "This number isn't linked to an ExpenseTrack Pro account yet. "
            "Open the app → Link WhatsApp to get a one-time code, then "
            "text back ‘LINK <code>’."
        )

    if not body:
        return _twiml("Send an amount and what it was for, e.g. ‘150 auto’.")

    parsed = _parse_expense_message(body)
    if parsed is None:
        return _twiml(
            "Couldn't find an amount in that message. Try something like ‘150 groceries’."
        )

    user_id = link["userId"]
    expense_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    expense = {
        "PK": db.user_pk(user_id),
        "SK": f"EXPENSE#{expense_id}",
        "id": expense_id,
        "date": now_iso,
        "amount": parsed["amount"],
        "category": parsed["category"],
        "description": parsed["description"],
        "createdAt": now_iso,
        "updatedAt": now_iso,
    }
    db.put_item(expense)

    return _twiml(
        f"Logged ₹{parsed['amount']:g} · {parsed['category'].replace('_', ' ')}. "
        f"Fix it anytime in the app if that's not quite right."
    )
