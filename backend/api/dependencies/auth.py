"""Who is making this request.

API Gateway's Cognito JWT authorizer (cdk/stacks/api_stack.py) verifies the
ID token BEFORE the request reaches this Lambda. Mangum puts the raw event on
`request.scope["aws.event"]`; the verified claims are at
`requestContext.authorizer.jwt.claims`. `sub` is the user's stable id.

No token verification happens here: it already happened at the gateway, so
routes only ask "who is this", never "is this valid".

Locally (uvicorn, no gateway) the headers X-Local-User-Id, and optionally
X-Local-User-Email / X-Local-User-Name, stand in for a signed-in user —
only outside prod.
"""
import os
from dataclasses import dataclass
from typing import Optional

from fastapi import HTTPException, Request


@dataclass(frozen=True)
class Identity:
    user_id: str
    email: Optional[str] = None
    name: Optional[str] = None
    # True when Cognito has verified the email (a code for email sign-ups;
    # Google's own email_verified, mapped in auth_stack.py) or it came from
    # Facebook. The user pool keeps the original email until a change is
    # verified (keep_original), so a user can't simply claim someone else's
    # address. Invites are only matched on a verified email.
    email_verified: bool = False

    @property
    def verified_email(self) -> Optional[str]:
        return self.email if self.email and self.email_verified else None


def _claims(request: Request) -> Optional[dict]:
    event = request.scope.get("aws.event")
    if event is None:
        return None
    return event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}).get("claims", {})


def get_identity(request: Request) -> Identity:
    claims = _claims(request)
    if claims is not None:
        sub = claims.get("sub")
        if not sub:
            raise HTTPException(status_code=401, detail="No authenticated user on this request")
        email = claims.get("email")
        name = claims.get("name") or claims.get("given_name")
        verified = str(claims.get("email_verified", "")).lower() == "true"
        if not verified and "Facebook" in str(claims.get("identities", "")):
            # Facebook only shares confirmed email addresses, but Cognito
            # can't map a "verified" flag for it.
            verified = True
        return Identity(user_id=sub, email=email.lower() if email else None, name=name, email_verified=verified)

    if os.environ.get("STAGE", "dev") != "prod":
        local_user = request.headers.get("x-local-user-id")
        if local_user:
            email = request.headers.get("x-local-user-email")
            return Identity(
                user_id=local_user,
                email=email.lower() if email else None,
                name=request.headers.get("x-local-user-name"),
                email_verified=bool(email) and request.headers.get("x-local-email-verified", "true") != "false",
            )

    raise HTTPException(status_code=401, detail="No authenticated user on this request")


def get_user_id(request: Request) -> str:
    return get_identity(request).user_id
