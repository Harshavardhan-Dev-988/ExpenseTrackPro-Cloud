"""Who is making this request.

API Gateway's Cognito JWT authorizer (wired up in cdk/stacks/api_stack.py)
verifies the token BEFORE the request ever reaches this Lambda — by the time
FastAPI sees it, the request is already authenticated. Mangum puts the raw
API Gateway event on `request.scope["aws.event"]`; the verified claims live
at `requestContext.authorizer.jwt.claims`, and `sub` is the Cognito user's
stable, unique id — that's the `userId` every DynamoDB item is scoped to.

No token verification happens in this file. That's deliberate: it already
happened at the API Gateway layer, so every route just asks "who is this"
rather than "is this valid".
"""
import os

from fastapi import HTTPException, Request


def get_user_id(request: Request) -> str:
    event = request.scope.get("aws.event")

    if event is not None:
        claims = (
            event.get("requestContext", {})
            .get("authorizer", {})
            .get("jwt", {})
            .get("claims", {})
        )
        user_id = claims.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="No authenticated user on this request")
        return user_id

    # Not running behind API Gateway — i.e. `uvicorn main:app --reload` on a
    # laptop. There's no Cognito authorizer in front of it locally, so allow
    # a header to stand in for a signed-in user during development only.
    if os.environ.get("STAGE", "dev") != "prod":
        local_user = request.headers.get("x-local-user-id")
        if local_user:
            return local_user

    raise HTTPException(status_code=401, detail="No authenticated user on this request")
