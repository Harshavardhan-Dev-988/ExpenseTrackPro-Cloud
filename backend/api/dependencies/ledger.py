"""Which ledger a request acts on, and whether the caller may.

The browser sends the ledger it's showing in an `X-Ledger-Id` header. When
it's missing (older clients, WhatsApp, first load) the user's default
ledger is used. The caller must be a member; mutating routes additionally
require editor or owner, and member/invite management requires owner.

Routes declare the access they need:
    ctx: LedgerCtx = Depends(reader)   any member
    ctx: LedgerCtx = Depends(editor)   editor or owner
    ctx: LedgerCtx = Depends(owner)    owner only
"""
from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, HTTPException, Request

import keys as K
from dependencies.auth import Identity, get_identity
from services import ledgers as L


@dataclass(frozen=True)
class LedgerCtx:
    identity: Identity
    ledger_id: str
    role: str

    @property
    def user_id(self) -> str:
        return self.identity.user_id

    @property
    def pk(self) -> str:
        return K.ledger_pk(self.ledger_id)

    @property
    def person(self) -> str:
        """This user as a split participant."""
        return f"m:{self.identity.user_id}"


def _resolve(request: Request, identity: Identity, need: str) -> LedgerCtx:
    ledger_id: Optional[str] = request.headers.get("x-ledger-id") or None
    if not ledger_id:
        profile = L.ensure_user(identity)
        ledger_id = profile["defaultLedgerId"]
    return resolve_for(ledger_id, identity, need)


def resolve_for(ledger_id: str, identity: Identity, need: str) -> LedgerCtx:
    """Access check for a ledger named in the URL rather than the header."""
    member = L.get_member(ledger_id, identity.user_id)
    if not member:
        if ledger_id == L.personal_ledger_id(identity.user_id):
            L.ensure_user(identity)
            member = L.get_member(ledger_id, identity.user_id)
        if not member:
            raise HTTPException(status_code=403, detail="You're not a member of this household")
    role = member.get("role", "viewer")
    if L.ROLE_RANK.get(role, 0) < L.ROLE_RANK[need]:
        detail = {
            "editor": "You have view-only access to this household",
            "owner": "Only the household's owner can do this",
        }[need]
        raise HTTPException(status_code=403, detail=detail)
    return LedgerCtx(identity=identity, ledger_id=ledger_id, role=role)


def reader(request: Request, identity: Identity = Depends(get_identity)) -> LedgerCtx:
    return _resolve(request, identity, "viewer")


def editor(request: Request, identity: Identity = Depends(get_identity)) -> LedgerCtx:
    return _resolve(request, identity, "editor")


def owner(request: Request, identity: Identity = Depends(get_identity)) -> LedgerCtx:
    return _resolve(request, identity, "owner")
