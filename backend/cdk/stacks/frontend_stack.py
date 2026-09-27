"""Hosting for the React frontend: a private S3 bucket behind CloudFront.

The bucket itself blocks all public access — CloudFront reaches it through
an Origin Access Control (OAC), so the only way to the files is through the
CDN (HTTPS, caching, a real domain-shaped URL). `BucketDeployment` uploads
the built app on every `cdk deploy` and invalidates the CloudFront cache so
visitors see the new build immediately instead of a stale cached one.

This expects the frontend to already be built for this deployment target —
see `../../../expense-tracker/package.json`'s `build:aws` script, which
builds with `--base=/` (the default `vite.config.ts` base of
`/ExpenseTrack-Pro/` is for the existing GitHub Pages deploy and would
break asset paths if served from a CloudFront distribution's root).
"""
import os

import aws_cdk as cdk
from aws_cdk import aws_cloudfront as cloudfront
from aws_cdk import aws_cloudfront_origins as origins
from aws_cdk import aws_s3 as s3
from aws_cdk import aws_s3_deployment as s3deploy
from constructs import Construct

FRONTEND_BUILD_DIR = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "expense-tracker", "dist-aws"
)


class FrontendStack(cdk.Stack):
    def __init__(self, scope: Construct, construct_id: str, *, stage: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        removal_policy = cdk.RemovalPolicy.DESTROY if stage != "prod" else cdk.RemovalPolicy.RETAIN

        site_bucket = s3.Bucket(
            self,
            "SiteBucket",
            bucket_name=f"expense-track-pro-site-{stage}-{cdk.Aws.ACCOUNT_ID}",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            encryption=s3.BucketEncryption.S3_MANAGED,
            removal_policy=removal_policy,
            auto_delete_objects=(stage != "prod"),
        )

        distribution = cloudfront.Distribution(
            self,
            "SiteDistribution",
            comment=f"expense-track-pro-{stage}",
            default_root_object="index.html",
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3BucketOrigin.with_origin_access_control(site_bucket),
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
            ),
            # No client-side router yet (the app is a single page with
            # internal tab state), but a stray deep link or a future
            # react-router addition should still land on the app shell
            # rather than a raw S3 403/404.
            error_responses=[
                cloudfront.ErrorResponse(
                    http_status=403,
                    response_http_status=200,
                    response_page_path="/index.html",
                ),
                cloudfront.ErrorResponse(
                    http_status=404,
                    response_http_status=200,
                    response_page_path="/index.html",
                ),
            ],
        )

        s3deploy.BucketDeployment(
            self,
            "SiteDeployment",
            sources=[s3deploy.Source.asset(FRONTEND_BUILD_DIR)],
            destination_bucket=site_bucket,
            distribution=distribution,
            distribution_paths=["/*"],
        )

        cdk.CfnOutput(self, "SiteUrl", value=f"https://{distribution.distribution_domain_name}")
        cdk.CfnOutput(self, "SiteBucketName", value=site_bucket.bucket_name)
