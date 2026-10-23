"""Hosting for the React frontend: a private S3 bucket behind CloudFront.

The bucket itself blocks all public access — CloudFront reaches it through
an Origin Access Control (OAC), so the only way to the files is through the
CDN (HTTPS, caching, a real domain-shaped URL). `BucketDeployment` uploads
the built app on every `cdk deploy` and invalidates the CloudFront cache so
visitors see the new build immediately instead of a stale cached one.

This expects the frontend to already be built for this deployment target —
see `../../../frontend/package.json`'s `build:aws` script, which
builds with `--base=/` (the default `vite.config.ts` base of
`/ExpenseTrack-Pro/` is for the existing GitHub Pages deploy and would
break asset paths if served from a CloudFront distribution's root).
"""
import os

import aws_cdk as cdk
from aws_cdk import aws_certificatemanager as acm
from aws_cdk import aws_cloudfront as cloudfront
from aws_cdk import aws_cloudfront_origins as origins
from aws_cdk import aws_route53 as route53
from aws_cdk import aws_route53_targets as route53_targets
from aws_cdk import aws_s3 as s3
from aws_cdk import aws_s3_deployment as s3deploy
from constructs import Construct

from .site_config import SiteConfig

FRONTEND_BUILD_DIR = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "frontend", "dist-aws"
)

# CloudFront Function (viewer request): anyone arriving on the old
# *.cloudfront.net address is sent to the custom domain with the same path
# and query string, so there is one canonical URL. __DOMAIN__ is filled in.
CANONICAL_HOST_FUNCTION = """
function handler(event) {
  var request = event.request;
  var host = request.headers.host ? request.headers.host.value : '';
  if (host === '__DOMAIN__') {
    return request;
  }
  var parts = [];
  var qs = request.querystring;
  for (var key in qs) {
    var entry = qs[key];
    var values = entry.multiValue ? entry.multiValue : [entry];
    for (var i = 0; i < values.length; i++) {
      parts.push(values[i].value === '' ? key : key + '=' + values[i].value);
    }
  }
  var location = 'https://__DOMAIN__' + request.uri + (parts.length ? '?' + parts.join('&') : '');
  return {
    statusCode: 301,
    statusDescription: 'Moved Permanently',
    headers: { location: { value: location }, 'cache-control': { value: 'max-age=3600' } }
  };
}
"""


class FrontendStack(cdk.Stack):
    def __init__(self, scope: Construct, construct_id: str, *, stage: str, site: SiteConfig, **kwargs) -> None:
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

        # Custom domain (optional, see site_config.py): the certificate lives
        # in us-east-1 and is created outside CDK; we only reference it.
        domain_kwargs = {}
        function_associations = []
        if site.custom_domain:
            domain_kwargs = dict(
                domain_names=[site.custom_domain],
                certificate=acm.Certificate.from_certificate_arn(
                    self, "SiteCertificate", site.certificate_arn
                ),
            )
            canonical_host = cloudfront.Function(
                self,
                "CanonicalHostRedirect",
                comment="Redirect the default CloudFront URL to the custom domain",
                runtime=cloudfront.FunctionRuntime.JS_2_0,
                code=cloudfront.FunctionCode.from_inline(
                    CANONICAL_HOST_FUNCTION.replace("__DOMAIN__", site.custom_domain)
                ),
            )
            function_associations = [
                cloudfront.FunctionAssociation(
                    function=canonical_host,
                    event_type=cloudfront.FunctionEventType.VIEWER_REQUEST,
                )
            ]

        distribution = cloudfront.Distribution(
            self,
            "SiteDistribution",
            comment=f"expense-track-pro-{stage}",
            default_root_object="index.html",
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3BucketOrigin.with_origin_access_control(site_bucket),
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
                function_associations=function_associations,
            ),
            **domain_kwargs,
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

        if site.custom_domain:
            # Alias records in the domain's Route 53 hosted zone (looked up by
            # name at synth time, so the zone must already exist).
            zone = route53.HostedZone.from_lookup(self, "Zone", domain_name=site.hosted_zone_name)
            target = route53.RecordTarget.from_alias(route53_targets.CloudFrontTarget(distribution))
            route53.ARecord(self, "SiteAliasIpv4", zone=zone, record_name=site.custom_domain, target=target)
            route53.AaaaRecord(self, "SiteAliasIpv6", zone=zone, record_name=site.custom_domain, target=target)
            cdk.CfnOutput(self, "AppUrl", value=site.custom_origin)

        cdk.CfnOutput(self, "SiteUrl", value=f"https://{distribution.distribution_domain_name}")
        cdk.CfnOutput(self, "SiteBucketName", value=site_bucket.bucket_name)
