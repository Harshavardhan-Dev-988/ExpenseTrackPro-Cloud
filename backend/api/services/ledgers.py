"""Ledgers (households), their members, and the user's profile.

A ledger is the unit of sharing: every expense, budget, category and rule
lives in one. Each user gets a personal ledger the first time they sign in
(or from the v1 → v2 migration); inviting family members adds them to it.
"""
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

import db
import keys as K
from dependencies.auth import Identity

_PERSONAL_NS = uuid.UUID("6b0c0a52-6f4e-4f6a-9d0e-2b9f6a1c7e11")

ROLE_RANK = {"viewer": 0, "editor": 1, "owner": 2}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def personal_ledger_id(user_id: str, generation: int = 0) -> str:
    """Deterministic, so the migration and first sign-in agree on it, and
    parallel first requests all land on the same household. Generation n
    is used only if the user handed generation n-1 to someone else."""
    suffix = f":{generation}" if generation else ""
    return str(uuid.uuid5(_PERSONAL_NS, f"personal:{user_id}{suffix}"))


def default_ledger_name(name: Optional[str]) -> str:
    first = (name or "").strip().split(" ")[0]
    return f"{first}'s household" if first else "My household"


# ---- items -----------------------------------------------------------------

def meta_item(ledger_id: str, name: str, owner_id: str, *, personal: bool, created: str, **extra) -> dict:
    return db.stamp(
        {
            "PK": K.ledger_pk(ledger_id),
            "SK": K.META,
            "GSI1PK": K.ALL_LEDGERS,
            "GSI1SK": ledger_id,
            "id": ledger_id,
            "name": name,
            "ownerId": owner_id,
            "isPersonal": personal,
            "createdAt": created,
            **extra,
        },
        K.T_LEDGER,
    )


def member_item(ledger_id: str, user_id: str, role: str, *, email=None, name=None, joined=None) -> dict:
    return db.stamp(
        {
            "PK": K.ledger_pk(ledger_id),
            "SK": f"{K.MEMBER}{user_id}",
            "GSI1PK": K.user_pk(user_id),
            "GSI1SK": K.ledger_pk(ledger_id),
            "ledgerId": ledger_id,
            "userId": user_id,
            "role": role,
            "email": email,
            "name": name,
            "joinedAt": joined or now_iso(),
        },
        K.T_MEMBER,
    )


def profile_item(user_id: str, **fields) -> dict:
    return db.stamp({"PK": K.user_pk(user_id), "SK": K.PROFILE, "userId": user_id, **fields}, K.T_PROFILE)


# ---- reads -----------------------------------------------------------------

def get_meta(ledger_id: str) -> Optional[dict]:
    return db.get_item(K.ledger_pk(ledger_id), K.META)


def get_member(ledger_id: str, user_id: str) -> Optional[dict]:
    return db.get_item(K.ledger_pk(ledger_id), f"{K.MEMBER}{user_id}")


def members(ledger_id: str) -> List[dict]:
    return db.query(K.ledger_pk(ledger_id), K.MEMBER)


def memberships(user_id: str) -> List[dict]:
    """MEMBER items for every ledger the user belongs to."""
    return db.query_index(db.GSI1, K.user_pk(user_id), prefix="LEDGER#")


def get_profile(user_id: str) -> Optional[dict]:
    return db.get_item(K.user_pk(user_id), K.PROFILE)


def member_names(ledger_id: str) -> Dict[str, str]:
    """userId -> display name, for labelling who did what."""
    out = {}
    for m in members(ledger_id):
        out[m["userId"]] = m.get("name") or (m.get("email") or "").split("@")[0] or "Member"
    return out


# ---- bootstrap -------------------------------------------------------------

def ensure_user(identity: Identity) -> dict:
    """Make sure the user has a profile and at least one ledger; refresh
    their email/name on their memberships. Returns the profile."""
    profile = get_profile(identity.user_id) or {}
    mine = memberships(identity.user_id)

    if not mine:
        mine = [_new_personal_ledger(identity)]

    ids = [m["ledgerId"] for m in mine]
    default = profile.get("defaultLedgerId")
    if default not in ids:
        owned = [m["ledgerId"] for m in mine if m.get("role") == "owner"]
        default = owned[0] if owned else ids[0]

    updates = {}
    if profile.get("defaultLedgerId") != default:
        updates["defaultLedgerId"] = default
    if identity.email and profile.get("email") != identity.email:
        updates["email"] = identity.email
    if identity.name and profile.get("name") != identity.name:
        updates["name"] = identity.name
    if not profile or updates:
        profile = {**(profile or profile_item(identity.user_id)), **updates}
        db.put_item(profile)

    # Keep member display details current (they come from the token).
    # Only those two fields, and only if the membership still exists: a
    # full put of this (possibly stale, index-read) copy could undo a
    # removal or a role change made a moment ago.
    for m in mine:
        if (identity.email and m.get("email") != identity.email) or (identity.name and m.get("name") != identity.name):
            db.update_fields(m["PK"], m["SK"], {"email": identity.email or m.get("email"), "name": identity.name or m.get("name")})
            meta = get_meta(m["ledgerId"])
            if meta and meta.get("isPersonal") and meta.get("name") == "My household" and identity.name:
                db.update_fields(meta["PK"], meta["SK"], {"name": default_ledger_name(identity.name)})
    return profile


def _new_personal_ledger(identity: Identity) -> dict:
    """A personal household for a user who belongs to none: the first id
    in their deterministic sequence that isn't owned by someone else."""
    for generation in range(50):
        lid = personal_ledger_id(identity.user_id, generation)
        meta = db.get_item(K.ledger_pk(lid), K.META, consistent=True)
        if meta and meta.get("ownerId") != identity.user_id:
            continue  # handed over to someone else; never rejoin it this way
        created = now_iso()
        if not meta:
            db.put_item(meta_item(lid, default_ledger_name(identity.name), identity.user_id,
                                  personal=True, created=created), if_absent=True)
            meta = db.get_item(K.ledger_pk(lid), K.META, consistent=True) or {}
            if meta.get("ownerId") != identity.user_id:
                continue
        member = member_item(lid, identity.user_id, "owner", email=identity.email, name=identity.name, joined=created)
        db.put_item(member, if_absent=True)
        return get_member(lid, identity.user_id) or member
    raise RuntimeError("Couldn't create a household")


def summaries(user_id: str) -> List[dict]:
    out = []
    for m in memberships(user_id):
        meta = get_meta(m["ledgerId"])
        if not meta:
            continue
        out.append(
            {
                "id": m["ledgerId"],
                "name": meta.get("name", "Household"),
                "role": m.get("role", "viewer"),
                "ownerId": meta.get("ownerId", ""),
                "isPersonal": bool(meta.get("isPersonal")),
                "memberCount": len(members(m["ledgerId"])),
            }
        )
    out.sort(key=lambda s: (s["role"] != "owner", not s["isPersonal"], s["name"].lower()))
    return out
