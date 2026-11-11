"""Settings = ledger-wide fields (currency, yearStart; shared by the
household, editable by editors) merged with personal fields (theme,
dateFormat, locale; each member's own, editable by anyone)."""
from fastapi import APIRouter, Depends

import db
import keys as K
from dependencies.ledger import LedgerCtx, reader
from models import LEDGER_SETTING_FIELDS, PERSONAL_SETTING_FIELDS, Settings
from services import ledgers as L

router = APIRouter(prefix="/settings", tags=["settings"])


def ledger_settings(ledger_id: str) -> dict:
    item = db.get_item(K.ledger_pk(ledger_id), K.SETTINGS) or {}
    return {k: v for k, v in db.public(item).items() if k in LEDGER_SETTING_FIELDS}


def _merged(ctx: LedgerCtx) -> Settings:
    profile = db.public(L.get_profile(ctx.user_id) or {})
    personal = {k: v for k, v in profile.items() if k in PERSONAL_SETTING_FIELDS}
    return Settings(**{**personal, **ledger_settings(ctx.ledger_id)})


@router.get("", response_model=Settings)
def get_settings(ctx: LedgerCtx = Depends(reader)):
    return _merged(ctx)


@router.put("", response_model=Settings)
def update_settings(payload: Settings, ctx: LedgerCtx = Depends(reader)):
    body = payload.model_dump(mode="json")

    profile = L.get_profile(ctx.user_id) or L.profile_item(ctx.user_id)
    db.put_item({**profile, **{k: body[k] for k in PERSONAL_SETTING_FIELDS}})

    # Household-wide fields: only editors and owners may change them;
    # a viewer's PUT still saves their personal fields.
    if L.ROLE_RANK.get(ctx.role, 0) >= L.ROLE_RANK["editor"]:
        current = ledger_settings(ctx.ledger_id)
        wanted = {k: body[k] for k in LEDGER_SETTING_FIELDS}
        if wanted != current:
            db.put_item(db.stamp({"PK": ctx.pk, "SK": K.SETTINGS, **wanted}, K.T_LEDGER_SETTINGS))
    return _merged(ctx)
