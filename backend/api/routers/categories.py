"""A ledger's custom categories and category groups.

    PK = LEDGER#<lid>   SK = CATGROUP#<groupId>    a custom parent group
    PK = LEDGER#<lid>   SK = CATEGORY#<categoryId> a custom sub-category

PUT is an upsert (create or rename). Expenses reference a category by id,
so renaming never touches them; deleting a category that's still in use is
the client's job to handle first (it reassigns those expenses), and a group
can only be deleted once no custom category points at it.
"""
import re

from fastapi import APIRouter, Depends, HTTPException

import db
import keys as K
from dependencies.ledger import LedgerCtx, editor, reader
from models import CustomCategories, CustomCategory, CustomCategoryGroup

router = APIRouter(prefix="/categories", tags=["categories"])

_ID = re.compile(r"^[a-z0-9_\-]{3,64}$")


def _check_id(value: str, prefix: str) -> None:
    if not _ID.match(value) or not value.startswith(prefix):
        raise HTTPException(status_code=400, detail=f"Ids must look like '{prefix}…' (a-z, 0-9, _ or -)")


@router.get("", response_model=CustomCategories)
def list_custom_categories(ctx: LedgerCtx = Depends(reader)):
    groups = [CustomCategoryGroup(**db.public(i)) for i in db.query(ctx.pk, K.CATEGORY_GROUP)]
    categories = [CustomCategory(**db.public(i)) for i in db.query(ctx.pk, K.CATEGORY)]
    return CustomCategories(groups=groups, categories=categories)


@router.put("/groups/{group_id}", response_model=CustomCategoryGroup)
def upsert_group(group_id: str, payload: CustomCategoryGroup, ctx: LedgerCtx = Depends(editor)):
    _check_id(group_id, "cg_")
    if payload.id != group_id:
        raise HTTPException(status_code=400, detail="Body id must match the URL id")
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Group name can't be empty")
    db.put_item(db.stamp({"PK": ctx.pk, "SK": f"{K.CATEGORY_GROUP}{group_id}", **payload.model_dump(mode="json")},
                         K.T_CATEGORY_GROUP))
    return payload


@router.delete("/groups/{group_id}", status_code=204)
def delete_group(group_id: str, ctx: LedgerCtx = Depends(editor)):
    if not db.get_item(ctx.pk, f"{K.CATEGORY_GROUP}{group_id}"):
        raise HTTPException(status_code=404, detail="Group not found")
    if any(c.get("groupId") == group_id for c in db.query(ctx.pk, K.CATEGORY)):
        raise HTTPException(status_code=409, detail="Move or delete this group's categories first")
    db.delete_item(ctx.pk, f"{K.CATEGORY_GROUP}{group_id}")


@router.put("/items/{category_id}", response_model=CustomCategory)
def upsert_category(category_id: str, payload: CustomCategory, ctx: LedgerCtx = Depends(editor)):
    _check_id(category_id, "custom_")
    if payload.id != category_id:
        raise HTTPException(status_code=400, detail="Body id must match the URL id")
    if not payload.label.strip():
        raise HTTPException(status_code=400, detail="Category name can't be empty")
    db.put_item(db.stamp({"PK": ctx.pk, "SK": f"{K.CATEGORY}{category_id}", **payload.model_dump(mode="json")},
                         K.T_CATEGORY))
    return payload


@router.delete("/items/{category_id}", status_code=204)
def delete_category(category_id: str, ctx: LedgerCtx = Depends(editor)):
    if not db.get_item(ctx.pk, f"{K.CATEGORY}{category_id}"):
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete_item(ctx.pk, f"{K.CATEGORY}{category_id}")
