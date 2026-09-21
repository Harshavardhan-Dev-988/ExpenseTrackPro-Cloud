"""The Lambda entrypoint (see cdk/stacks/api_stack.py: index=lambda_handler.py,
handler=handler). Mangum translates API Gateway's HTTP API events into ASGI
calls the FastAPI app understands, and translates the response back.
"""
from mangum import Mangum

from main import app

handler = Mangum(app)
