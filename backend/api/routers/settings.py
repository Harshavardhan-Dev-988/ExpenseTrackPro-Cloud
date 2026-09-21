"""One settings record per user — created with defaults on first read."""
from fastapi import APIRouter, Depends

import db
from dependencies.auth import get_user_id
from models import Settings

router = APIRouter(prefix="/settings", tags=["settings"])

SK = "SETTINGS"


@router.get("", response_model=Settings)
def get_settings(user_id: str = Depends(get_user_id)):
    item = db.get_item(db.user_pk(user_id), SK)
    if not item:
        return Settings()
    return Settings(**{k: v for k, v in item.items() if k not in ("PK", "SK")})


@router.put("", response_model=Settings)
def update_settings(payload: Settings, user_id: str = Depends(get_user_id)):
    item = {"PK": db.user_pk(user_id), "SK": SK, **payload.model_dump(mode="json")}
    db.put_item(item)
    return payload
