"""Where the web app is served from — the one place every stack reads it.

The app is always reachable on its CloudFront default URL. Once a custom
domain is set up (see "Custom domain" in the root README), three context
values in `cdk.json` switch it on:

    "customDomain":   "app.example.com"     the address users type
    "hostedZoneName": "example.com"         the Route 53 zone that holds it
    "certificateArn": "arn:aws:acm:us-east-1:…"   ACM certificate for customDomain

CloudFront only accepts certificates from us-east-1, and this AWS project
can't run CloudFormation there, so the certificate is requested once in the
ACM console (us-east-1) rather than by CDK; its ARN is passed in here.

Every origin list in the system — Cognito callback/sign-out URLs, the HTTP
API's CORS, the receipts bucket's CORS and the Lambda's APP_ORIGINS — is
built from `SiteConfig.origins`, so adding the domain is one change, not five.
"""
from dataclasses import dataclass
from typing import List, Optional

from constructs import Construct

CLOUDFRONT_ORIGIN = "https://d3bttra9tv41h7.cloudfront.net"
LOCAL_DEV_ORIGINS = ["http://localhost:5173", "http://localhost:5193"]


@dataclass(frozen=True)
class SiteConfig:
    custom_domain: Optional[str] = None
    hosted_zone_name: Optional[str] = None
    certificate_arn: Optional[str] = None

    @classmethod
    def from_context(cls, scope: Construct) -> "SiteConfig":
        def get(key: str) -> Optional[str]:
            value = scope.node.try_get_context(key)
            return value.strip() if isinstance(value, str) and value.strip() else None

        config = cls(
            custom_domain=get("customDomain"),
            hosted_zone_name=get("hostedZoneName"),
            certificate_arn=get("certificateArn"),
        )
        if config.custom_domain:
            missing = [
                name
                for name, value in (
                    ("hostedZoneName", config.hosted_zone_name),
                    ("certificateArn", config.certificate_arn),
                )
                if not value
            ]
            if missing:
                raise ValueError(
                    f"customDomain is set to {config.custom_domain!r} but {', '.join(missing)} "
                    "is missing from cdk.json context. See 'Custom domain' in the README."
                )
            if ":us-east-1:" not in (config.certificate_arn or ""):
                raise ValueError("certificateArn must be an ACM certificate in us-east-1 (CloudFront requirement).")
        return config

    @property
    def custom_origin(self) -> Optional[str]:
        return f"https://{self.custom_domain}" if self.custom_domain else None

    @property
    def origins(self) -> List[str]:
        """Every origin the browser app runs on, without a trailing slash."""
        extra = [self.custom_origin] if self.custom_origin else []
        return [*LOCAL_DEV_ORIGINS, CLOUDFRONT_ORIGIN, *extra]

    @property
    def callback_urls(self) -> List[str]:
        """Cognito wants the exact redirect URL, which for this SPA is the root path."""
        return [f"{origin}/" for origin in self.origins]
