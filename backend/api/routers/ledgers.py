"""The signed-in user (/me), their households (/ledgers), members and invites.

Roles: owner (one per ledger: manages members, renames or deletes it),
editor (adds and changes data), viewer (reads only).

An invite is addressed to an email. When someone signs in with that email
(Cognito tells us it, from the ID token) the invite shows up in /me and they
can accept or decline it. Invites expire after 14 days (DynamoDB TTL).
"""
import os
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException

import db
import keys as K
from dependencies.auth import Identity, get_identity
from dependencies.ledger import resolve_for
from models import (
    ROLES,
    Invite,
    InviteCreate,
    LedgerCreate,
    LedgerSummary,
    LedgerUpdate,
    Me,
    Member,
    MemberUpdate,
    Preferences,
    PreferencesUpdate,
)
from services import ledgers as L

router = APIRouter(tags=["ledgers"])

INVITE_TTL = timedelta(days=14)
MAX_MEMBERS = 20


def _email_enabled() -> bool:
    return os.environ.get("EMAIL_ENABLED", "false").lower() == "true"


def _invite_from_item(item: dict) -> Invite:
    data = db.public(item)
    return Invite(**data)


def pending_invites(email: str | None) -> List[Invite]:
    if not email:
        return []
    now = int(time.time())
    out = []
    for item in db.query_index(db.GSI1, K.invite_gsi(email), prefix="LEDGER#"):
        if int(item.get("ttl", now + 1)) > now:
            out.append(_invite_from_item(item))
    return out


def _preferences(profile: dict) -> Preferences:
    data = db.public(profile)
    return Preferences(**{k: data[k] for k in Preferences.model_fields if k in data})


# ---- me ----------------------------------------------------------------------

@router.get("/me", response_model=Me)
def get_me(identity: Identity = Depends(get_identity)):
    profile = L.ensure_user(identity)
    return Me(
        userId=identity.user_id,
        email=identity.email or profile.get("email"),
        name=identity.name or profile.get("name"),
        defaultLedgerId=profile["defaultLedgerId"],
        ledgers=[LedgerSummary(**s) for s in L.summaries(identity.user_id)],
        invites=pending_invites(identity.verified_email),
        preferences=_preferences(profile),
        emailSendingEnabled=_email_enabled(),
    )


@router.put("/me/preferences", response_model=Preferences)
def update_preferences(payload: PreferencesUpdate, identity: Identity = Depends(get_identity)):
    profile = L.ensure_user(identity)
    updates = payload.model_dump(exclude_unset=True)
    if "defaultLedgerId" in updates:
        if not updates["defaultLedgerId"] or not L.get_member(updates["defaultLedgerId"], identity.user_id):
            raise HTTPException(status_code=400, detail="You're not a member of that household")
    changes = {k: v for k, v in updates.items() if v is not None}
    db.update_fields(profile["PK"], profile["SK"], changes)
    return _preferences({**profile, **changes})


# ---- ledgers -------------------------------------------------------------------

@router.post("/ledgers", response_model=LedgerSummary, status_code=201)
def create_ledger(payload: LedgerCreate, identity: Identity = Depends(get_identity)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Give the household a name")
    L.ensure_user(identity)
    lid = str(uuid.uuid4())
    created = L.now_iso()
    db.transact(
        [
            {"put_new": L.meta_item(lid, name[:80], identity.user_id, personal=False, created=created)},
            {"put": L.member_item(lid, identity.user_id, "owner", email=identity.email, name=identity.name, joined=created)},
        ]
    )
    return LedgerSummary(id=lid, name=name[:80], role="owner", ownerId=identity.user_id, isPersonal=False, memberCount=1)


@router.patch("/ledgers/{ledger_id}", response_model=LedgerSummary)
def rename_ledger(ledger_id: str, payload: LedgerUpdate, identity: Identity = Depends(get_identity)):
    resolve_for(ledger_id, identity, "owner")
    name = payload.name.strip()[:80]
    if not name:
        raise HTTPException(status_code=400, detail="Give the household a name")
    meta = L.get_meta(ledger_id)
    db.update_fields(K.ledger_pk(ledger_id), K.META, {"name": name})
    return LedgerSummary(id=ledger_id, name=name, role="owner", ownerId=meta["ownerId"],
                         isPersonal=bool(meta.get("isPersonal")), memberCount=len(L.members(ledger_id)))


@router.delete("/ledgers/{ledger_id}", status_code=204)
def delete_ledger(ledger_id: str, identity: Identity = Depends(get_identity)):
    """Deletes a household and everything in it. A personal household can't
    be deleted while it's the user's only one."""
    resolve_for(ledger_id, identity, "owner")
    meta = L.get_meta(ledger_id) or {}
    mine = L.memberships(identity.user_id)
    if meta.get("isPersonal") and len(mine) <= 1:
        raise HTTPException(status_code=409, detail="This is your only household, so it can't be deleted")
    # Data first, then members and META, so a timeout half-way leaves a
    # household that can still be opened and deleted again (and the jobs
    # skip rules whose household META is gone). Receipt photos under
    # receipts/<lid>/ are left in S3.
    items = db.query(K.ledger_pk(ledger_id))
    last = [i for i in items if i["SK"] == K.META or i["SK"].startswith(K.MEMBER)]
    first = [i for i in items if i not in last]
    db.batch_write(deletes=[(i["PK"], i["SK"]) for i in first])
    db.batch_write(deletes=[(i["PK"], i["SK"]) for i in last])


# ---- members ---------------------------------------------------------------------

@router.get("/ledgers/{ledger_id}/members", response_model=List[Member])
def list_members(ledger_id: str, identity: Identity = Depends(get_identity)):
    resolve_for(ledger_id, identity, "viewer")
    out = [Member(**db.public(m)) for m in L.members(ledger_id)]
    rank = {"owner": 0, "editor": 1, "viewer": 2}
    return sorted(out, key=lambda m: (rank.get(m.role, 3), (m.name or m.email or "").lower()))


@router.put("/ledgers/{ledger_id}/members/{user_id}", response_model=Member)
def change_role(ledger_id: str, user_id: str, payload: MemberUpdate, identity: Identity = Depends(get_identity)):
    """Owner changes someone's role. Making someone else the owner hands the
    household over: the current owner becomes an editor."""
    resolve_for(ledger_id, identity, "owner")
    if payload.role not in ROLES:
        raise HTTPException(status_code=400, detail=f"Role must be one of {', '.join(ROLES)}")
    target = L.get_member(ledger_id, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Not a member of this household")
    if user_id == identity.user_id:
        raise HTTPException(status_code=400, detail="Hand ownership to someone else instead of changing your own role")

    if payload.role == "owner":
        me = L.get_member(ledger_id, identity.user_id)
        meta = L.get_meta(ledger_id)
        db.transact(
            [
                {"put": {**target, "role": "owner"}},
                {"put": {**me, "role": "editor"}},
                {"put": {**meta, "ownerId": user_id}},
            ]
        )
    else:
        db.update_fields(target["PK"], target["SK"], {"role": payload.role})
    return Member(**db.public({**target, "role": payload.role}))


@router.delete("/ledgers/{ledger_id}/members/{user_id}", status_code=204)
def remove_member(ledger_id: str, user_id: str, identity: Identity = Depends(get_identity)):
    """The owner removes someone, or a member leaves (user_id = themselves)."""
    leaving = user_id == identity.user_id
    ctx = resolve_for(ledger_id, identity, "viewer" if leaving else "owner")
    if leaving and ctx.role == "owner":
        raise HTTPException(status_code=409, detail="Hand the household to someone else before leaving it")
    if not L.get_member(ledger_id, user_id):
        raise HTTPException(status_code=404, detail="Not a member of this household")
    db.delete_item(K.ledger_pk(ledger_id), f"{K.MEMBER}{user_id}")
    profile = L.get_profile(user_id)
    if profile and profile.get("defaultLedgerId") == ledger_id:
        db.update_fields(profile["PK"], profile["SK"], {}, remove=["defaultLedgerId"])


# ---- invites -----------------------------------------------------------------------

@router.get("/ledgers/{ledger_id}/invites", response_model=List[Invite])
def list_invites(ledger_id: str, identity: Identity = Depends(get_identity)):
    resolve_for(ledger_id, identity, "owner")
    now = int(time.time())
    return [_invite_from_item(i) for i in db.query(K.ledger_pk(ledger_id), K.INVITE) if int(i.get("ttl", now + 1)) > now]


@router.post("/ledgers/{ledger_id}/invites", response_model=Invite, status_code=201)
def create_invite(ledger_id: str, payload: InviteCreate, identity: Identity = Depends(get_identity)):
    resolve_for(ledger_id, identity, "owner")
    email = payload.email.strip().lower()
    if "@" not in email or len(email) > 254 or " " in email:
        raise HTTPException(status_code=400, detail="That doesn't look like an email address")
    if payload.role not in ("editor", "viewer"):
        raise HTTPException(status_code=400, detail="Invite someone as an editor or a viewer")
    current = L.members(ledger_id)
    if any((m.get("email") or "").lower() == email for m in current):
        raise HTTPException(status_code=409, detail="That person is already in this household")
    if len(current) >= MAX_MEMBERS:
        raise HTTPException(status_code=409, detail=f"A household can have at most {MAX_MEMBERS} members")

    meta = L.get_meta(ledger_id) or {}
    created = datetime.now(timezone.utc)
    expires = created + INVITE_TTL
    invite = {
        "ledgerId": ledger_id,
        "ledgerName": meta.get("name"),
        "email": email,
        "role": payload.role,
        "invitedBy": identity.user_id,
        "invitedByName": identity.name or identity.email,
        "createdAt": created.isoformat(),
        "expiresAt": expires.isoformat(),
    }
    db.put_item(
        db.stamp(
            {
                "PK": K.ledger_pk(ledger_id),
                "SK": f"{K.INVITE}{email}",
                "GSI1PK": K.invite_gsi(email),
                "GSI1SK": K.ledger_pk(ledger_id),
                "ttl": int(expires.timestamp()),
                **invite,
            },
            K.T_INVITE,
        )
    )
    return Invite(**invite)


@router.delete("/ledgers/{ledger_id}/invites/{email}", status_code=204)
def revoke_invite(ledger_id: str, email: str, identity: Identity = Depends(get_identity)):
    resolve_for(ledger_id, identity, "owner")
    db.delete_item(K.ledger_pk(ledger_id), f"{K.INVITE}{email.strip().lower()}")


def _my_invite(ledger_id: str, identity: Identity) -> dict:
    if not identity.verified_email:
        raise HTTPException(status_code=403, detail="Verify your email address to accept invites")
    item = db.get_item(K.ledger_pk(ledger_id), f"{K.INVITE}{identity.verified_email}")
    if not item or int(item.get("ttl", 0)) < int(time.time()):
        raise HTTPException(status_code=404, detail="This invite has expired or was withdrawn")
    return item


@router.post("/invites/{ledger_id}/accept", response_model=LedgerSummary)
def accept_invite(ledger_id: str, identity: Identity = Depends(get_identity)):
    invite = _my_invite(ledger_id, identity)
    L.ensure_user(identity)
    if not L.get_member(ledger_id, identity.user_id):
        db.transact(
            [
                {"put": L.member_item(ledger_id, identity.user_id, invite["role"], email=identity.email, name=identity.name)},
                {"delete": (invite["PK"], invite["SK"])},
            ]
        )
    else:
        db.delete_item(invite["PK"], invite["SK"])
    meta = L.get_meta(ledger_id) or {}
    member = L.get_member(ledger_id, identity.user_id)
    return LedgerSummary(id=ledger_id, name=meta.get("name", "Household"), role=member["role"],
                         ownerId=meta.get("ownerId", ""), isPersonal=bool(meta.get("isPersonal")),
                         memberCount=len(L.members(ledger_id)))


@router.post("/invites/{ledger_id}/decline", status_code=204)
def decline_invite(ledger_id: str, identity: Identity = Depends(get_identity)):
    invite = _my_invite(ledger_id, identity)
    db.delete_item(invite["PK"], invite["SK"])
