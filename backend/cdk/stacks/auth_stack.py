"""Cognito User Pool for ExpenseTrack Pro.

Phase 1/2 scope: email + password sign-up/sign-in via the Hosted UI. Phase 3
(this file, as of the Google/Facebook additions below) federates Google and
Facebook into this SAME user pool: each is a `UserPoolIdentityProvider*`
construct, added to the app client's `supported_identity_providers`, with
the Hosted UI then rendering "Continue with Google/Facebook" buttons
automatically — no frontend code changes needed for that part.

Both providers' OAuth client secrets are read from Secrets Manager (never
committed to source, never passed on a command line) via
`cdk.SecretValue.secrets_manager(...)` — see the aws-auth skill's
managed-login-oauth.md for why: raw secrets in `--provider-details` or
similar are exposed via shell history and process listings.
"""
import aws_cdk as cdk
from aws_cdk import aws_cognito as cognito
from constructs import Construct

GOOGLE_OAUTH_SECRET_NAME = "expense-track-pro/google-oauth-client-secret"
GOOGLE_OAUTH_CLIENT_ID = "1017707731916-5vpkc9j635ner352bveedc8t4urgj5ra.apps.googleusercontent.com"


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

        # Google federation. Facebook will be added the same way once its
        # app is out of setup (Meta apps can take longer to configure than
        # Google's console) - just another UserPoolIdentityProviderFacebook
        # construct plus FACEBOOK in supported_identity_providers below.
        google_provider = cognito.UserPoolIdentityProviderGoogle(
            self,
            "GoogleProvider",
            user_pool=self.user_pool,
            client_id=GOOGLE_OAUTH_CLIENT_ID,
            client_secret_value=cdk.SecretValue.secrets_manager(GOOGLE_OAUTH_SECRET_NAME),
            scopes=["email", "profile", "openid"],
            attribute_mapping=cognito.AttributeMapping(
                email=cognito.ProviderAttribute.GOOGLE_EMAIL,
                fullname=cognito.ProviderAttribute.GOOGLE_NAME,
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
                    "https://d3bttra9tv41h7.cloudfront.net/",
                ],
                logout_urls=[
                    "http://localhost:5173/",
                    "http://localhost:5193/",
                    "https://d3bttra9tv41h7.cloudfront.net/",
                ],
            ),
            supported_identity_providers=[
                cognito.UserPoolClientIdentityProvider.COGNITO,
                cognito.UserPoolClientIdentityProvider.GOOGLE,
            ],
            prevent_user_existence_errors=True,
        )
        # CDK doesn't infer this dependency automatically (the client only
        # references the provider by an enum name, not a construct
        # reference), and CloudFormation needs the identity provider to
        # exist in the pool before the client is updated to allow it -
        # otherwise the deploy can race and fail on a fresh stack.
        self.user_pool_client.node.add_dependency(google_provider)

        cdk.CfnOutput(self, "UserPoolId", value=self.user_pool.user_pool_id)
        cdk.CfnOutput(self, "UserPoolClientId", value=self.user_pool_client.user_pool_client_id)
        cdk.CfnOutput(
            self,
            "HostedUiDomainUrl",
            value=f"https://{self.user_pool_domain.domain_name}.auth.{self.region}.amazoncognito.com",
        )
