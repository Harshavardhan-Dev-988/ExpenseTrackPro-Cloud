"""Presigned S3 URLs for receipt photos — the image bytes never pass through
this Lambda. The receipts bucket (see cdk/stacks/data_stack.py) blocks all
public access, so every access — upload or view — goes through a
short-lived, per-user-scoped presigned URL generated here.

The `Expense.receiptUrl` field, despite its name, holds the S3 *object key*
for a cloud-backed expense (e.g. "receipts/<userId>/<uuid>.jpg"), not a
directly-resolvable URL — the bucket is private, so the frontend calls
GET /receipts/view-url each time it actually wants to display the image,
rather than storing one long-lived link.

Accepted limitation: a presigned PUT constrains the declared Content-Type
(the client must send that exact header, or the signature is rejected) but
doesn't verify the uploaded bytes actually match it, and doesn't cap file
size. Fine for a personal-finance app with no public upload surface; a
stricter setup would add a post-upload Lambda trigger to verify/resize.
"""
import os
import uuid

import boto3
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from dependencies.auth import get_user_id

router = APIRouter(prefix="/receipts", tags=["receipts"])

_s3 = None


def _client():
    """Lazily creates the boto3 S3 client (mirrors db.py's `table()` —
    importing this module shouldn't require AWS credentials)."""
    global _s3
    if _s3 is None:
        _s3 = boto3.client("s3")
    return _s3


BUCKET_NAME_ENV = "RECEIPTS_BUCKET_NAME"
UPLOAD_URL_TTL_SECONDS = 300
VIEW_URL_TTL_SECONDS = 300

ALLOWED_CONTENT_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
}


class UploadUrlRequest(BaseModel):
    contentType: str


class UploadUrlResponse(BaseModel):
    uploadUrl: str
    key: str


class ViewUrlResponse(BaseModel):
    viewUrl: str


def _bucket_name() -> str:
    return os.environ[BUCKET_NAME_ENV]


def _user_prefix(user_id: str) -> str:
    return f"receipts/{user_id}/"


@router.post("/upload-url", response_model=UploadUrlResponse)
def create_upload_url(payload: UploadUrlRequest, user_id: str = Depends(get_user_id)):
    extension = ALLOWED_CONTENT_TYPES.get(payload.contentType)
    if not extension:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported content type '{payload.contentType}'. "
            f"Allowed: {', '.join(ALLOWED_CONTENT_TYPES)}",
        )

    key = f"{_user_prefix(user_id)}{uuid.uuid4()}.{extension}"
    upload_url = _client().generate_presigned_url(
        "put_object",
        Params={"Bucket": _bucket_name(), "Key": key, "ContentType": payload.contentType},
        ExpiresIn=UPLOAD_URL_TTL_SECONDS,
    )
    return UploadUrlResponse(uploadUrl=upload_url, key=key)


@router.get("/view-url", response_model=ViewUrlResponse)
def create_view_url(key: str, user_id: str = Depends(get_user_id)):
    if not key.startswith(_user_prefix(user_id)):
        # Either a stale/mistyped key, or someone probing for another
        # user's receipts by guessing a key - either way, no presigned URL
        # for anything outside the caller's own prefix.
        raise HTTPException(status_code=403, detail="Not your receipt")

    view_url = _client().generate_presigned_url(
        "get_object",
        Params={"Bucket": _bucket_name(), "Key": key},
        ExpiresIn=VIEW_URL_TTL_SECONDS,
    )
    return ViewUrlResponse(viewUrl=view_url)


@router.delete("/{key:path}", status_code=204)
def delete_receipt(key: str, user_id: str = Depends(get_user_id)):
    if not key.startswith(_user_prefix(user_id)):
        raise HTTPException(status_code=403, detail="Not your receipt")
    _client().delete_object(Bucket=_bucket_name(), Key=key)
