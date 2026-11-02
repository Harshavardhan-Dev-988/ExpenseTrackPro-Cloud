"""A user's custom categories and category groups.

Stored in the user's own partition next to everything else they own:

    PK = USER#<sub>   SK = CATGROUP#<groupId>    a custom parent group
    PK = USER#<sub>   SK = CATEGORY#<categoryId> a custom sub-category

PUT is an upsert (create or rename). Expenses keep referencing a category by
id, so renaming never touches them; deleting a category that's still in use
is the client's job to handle first (it reassigns those expenses), and a
group can only be deleted once no custom category points at it.
"""
import re

from fastapi import APIRouter, Depends, HTTPException

import db
from dependencies.auth import get_user_id
from models import CustomCategories, CustomCategory, CustomCategoryGroup

router = APIRouter(prefix="/categories", tags=["categories"])

GROUP_PREFIX = "CATGROUP#"
CATEGORY_PREFIX = "CATEGORY#"
_ID = re.compile(r"^[a-z0-9_\-]{3,64}$")


def _strip_keys(item: dict) -> dict:
    return {k: v for k, v in item.items() if k not in ("PK", "SK")}


def _check_id(value: str, prefix: str) -> None:
    if not _ID.match(value) or not value.startswith(prefix):
        raise HTTPException(status_code=400, detail=f"Ids must look like '{prefix}…' (a-z, 0-9, _ or -)")


@router.get("", response_model=CustomCategories)
def list_custom_categories(user_id: str = Depends(get_user_id)):
    pk = db.user_pk(user_id)
    groups = [CustomCategoryGroup(**_strip_keys(i)) for i in db.query_by_sk_prefix(pk, GROUP_PREFIX)]
    categories = [CustomCategory(**_strip_keys(i)) for i in db.query_by_sk_prefix(pk, CATEGORY_PREFIX)]
    return CustomCategories(groups=groups, categories=categories)


@router.put("/groups/{group_id}", response_model=CustomCategoryGroup)
def upsert_group(group_id: str, payload: CustomCategoryGroup, user_id: str = Depends(get_user_id)):
    _check_id(group_id, "cg_")
    if payload.id != group_id:
        raise HTTPException(status_code=400, detail="Body id must match the URL id")
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Group name can't be empty")
    db.put_item({"PK": db.user_pk(user_id), "SK": f"{GROUP_PREFIX}{group_id}", **payload.model_dump(mode="json")})
    return payload


@router.delete("/groups/{group_id}", status_code=204)
def delete_group(group_id: str, user_id: str = Depends(get_user_id)):
    pk = db.user_pk(user_id)
    if not db.get_item(pk, f"{GROUP_PREFIX}{group_id}"):
        raise HTTPException(status_code=404, detail="Group not found")
    in_use = [c for c in db.query_by_sk_prefix(pk, CATEGORY_PREFIX) if c.get("groupId") == group_id]
    if in_use:
        raise HTTPException(status_code=409, detail="Move or delete this group's categories first")
    db.delete_item(pk, f"{GROUP_PREFIX}{group_id}")


@router.put("/items/{category_id}", response_model=CustomCategory)
def upsert_category(category_id: str, payload: CustomCategory, user_id: str = Depends(get_user_id)):
    _check_id(category_id, "custom_")
    if payload.id != category_id:
        raise HTTPException(status_code=400, detail="Body id must match the URL id")
    if not payload.label.strip():
        raise HTTPException(status_code=400, detail="Category name can't be empty")
    db.put_item({"PK": db.user_pk(user_id), "SK": f"{CATEGORY_PREFIX}{category_id}", **payload.model_dump(mode="json")})
    return payload


@router.delete("/items/{category_id}", status_code=204)
def delete_category(category_id: str, user_id: str = Depends(get_user_id)):
    pk = db.user_pk(user_id)
    if not db.get_item(pk, f"{CATEGORY_PREFIX}{category_id}"):
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete_item(pk, f"{CATEGORY_PREFIX}{category_id}")
