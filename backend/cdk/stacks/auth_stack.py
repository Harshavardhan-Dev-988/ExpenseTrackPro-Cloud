"""Cognito User Pool for ExpenseTrack Pro.

Phase 1 scope: email + password sign-up/sign-in only. Phase 3 adds Google and
Facebook as federated identity providers to this SAME user pool (via
`user_pool.add_identity_provider(...)` and by adding "COGNITO", "Google",
"Facebook" to the client's `supported_identity_providers`) — nothing here
needs to change shape for that, it's additive.
"""
import aws_cdk as cdk
from aws_cdk import aws_cognito as cognito
from constructs import Construct


class AuthStack(cdk.Stack):
    def __init__(self, scope: Construct, construct_id: str, *, stage: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        removal_policy = cdk.RemovalPolicy.DESTROY if stage != "prod" else cdk.RemovalPolicy.RETAIN

        self.user_pool = cognito.UserPool(
            self,
            "UserPool",
            user_pool_name=f"expense-track-pro-{stage}",
            self_sign_up_enabled=True,
            sign_in_aliases=cognito.SignInAliases(email=True, username=False),
            auto_verify=cognito.AutoVerifiedAttrs(email=True),
            standard_attributes=cognito.StandardAttributes(
                email=cognito.StandardAttribute(required=True, mutable=True),
            ),
            password_policy=cognito.PasswordPolicy(
                min_length=8,
                require_lowercase=True,
                require_uppercase=True,
                require_digits=True,
                require_symbols=False,
            ),
            account_recovery=cognito.AccountRecovery.EMAIL_ONLY,
            removal_policy=removal_policy,
        )

        # Hosted UI domain — usable today for email/password, and it's what
        # phase 3's "Continue with Google/Facebook" buttons render on.
        # Prefix must be globally unique across all of Cognito; if
        # `expense-track-pro-<stage>` is taken, change it here.
        self.user_pool_domain = self.user_pool.add_domain(
            "HostedUiDomain",
            cognito_domain=cognito.CognitoDomainOptions(
                domain_prefix=f"expense-track-pro-{stage}",
            ),
        )

        # Public SPA client — no secret, since it runs in the browser.
        # callback/logout URLs start with localhost + a placeholder; update
        # them once the frontend has a real CloudFront/custom domain
        # (`user_pool_client.node.default_child` isn't needed — just re-deploy
        # this stack with the real URLs added to the lists below).
        self.user_pool_client = self.user_pool.add_client(
            "SpaClient",
            generate_secret=False,
            auth_flows=cognito.AuthFlow(user_srp=True, user_password=True),
            o_auth=cognito.OAuthSettings(
                flows=cognito.OAuthFlows(authorization_code_grant=True),
                scopes=[cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
                callback_urls=[
                    "http://localhost:5173/",
                    "http://localhost:5193/",
                ],
                logout_urls=[
                    "http://localhost:5173/",
                    "http://localhost:5193/",
                ],
            ),
            supported_identity_providers=[cognito.UserPoolClientIdentityProvider.COGNITO],
            prevent_user_existence_errors=True,
        )

        cdk.CfnOutput(self, "UserPoolId", value=self.user_pool.user_pool_id)
        cdk.CfnOutput(self, "UserPoolClientId", value=self.user_pool_client.user_pool_client_id)
        cdk.CfnOutput(
            self,
            "HostedUiDomainUrl",
            value=f"https://{self.user_pool_domain.domain_name}.auth.{self.region}.amazoncognito.com",
        )
