"""CloudWatch alarms for the API's three moving parts (Lambda, HTTP API,
DynamoDB table), all fanning into one SNS topic with an email subscription.

This is deliberately a separate stack rather than folding alarms into
ApiStack/DataStack: alarms reference resources from both of those, and
keeping them here means either stack can be redeployed without touching
alarm state, and the whole monitoring surface can be found in one file.

Thresholds are simple sum/count triggers, not statistical baselining - this
is a small single-user-per-account app, so "any error at all in a 5 minute
window" is a meaningful signal, not noise.
"""
import aws_cdk as cdk
from aws_cdk import aws_apigatewayv2 as apigwv2
from aws_cdk import aws_cloudwatch as cloudwatch
from aws_cdk import aws_cloudwatch_actions as cw_actions
from aws_cdk import aws_dynamodb as dynamodb
from aws_cdk import aws_lambda as _lambda
from aws_cdk import aws_sns as sns
from aws_cdk import aws_sns_subscriptions as subscriptions
from constructs import Construct


class MonitoringStack(cdk.Stack):
    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        *,
        stage: str,
        fn: _lambda.Function,
        http_api: apigwv2.HttpApi,
        table: dynamodb.TableV2,
        alert_email: str,
        **kwargs,
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        topic = sns.Topic(self, "AlertsTopic", topic_name=f"expense-track-pro-alerts-{stage}")
        topic.add_subscription(subscriptions.EmailSubscription(alert_email))

        def _alarm(id: str, metric: cloudwatch.Metric, *, threshold: float, evaluation_periods: int = 1,
                   description: str) -> cloudwatch.Alarm:
            alarm = cloudwatch.Alarm(
                self,
                id,
                metric=metric,
                threshold=threshold,
                evaluation_periods=evaluation_periods,
                comparison_operator=cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
                treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
                alarm_description=description,
            )
            alarm.add_alarm_action(cw_actions.SnsAction(topic))
            return alarm

        # Lambda: any error, or any throttle (means requests are being
        # rejected outright - concurrency limit hit).
        _alarm(
            "LambdaErrorsAlarm",
            fn.metric_errors(period=cdk.Duration.minutes(5), statistic="Sum"),
            threshold=1,
            description="ExpenseTrack API Lambda raised at least one error in a 5 minute window",
        )
        _alarm(
            "LambdaThrottlesAlarm",
            fn.metric_throttles(period=cdk.Duration.minutes(5), statistic="Sum"),
            threshold=1,
            description="ExpenseTrack API Lambda was throttled at least once in a 5 minute window",
        )

        # HTTP API: any 5xx (our own bugs / Lambda failures surfacing as
        # gateway errors), and sustained high latency (2 consecutive 5-minute
        # windows with p99 over 3s - one slow blip shouldn't page anyone).
        _alarm(
            "ApiServerErrorAlarm",
            http_api.metric_server_error(period=cdk.Duration.minutes(5), statistic="Sum"),
            threshold=1,
            description="ExpenseTrack HTTP API returned at least one 5xx in a 5 minute window",
        )
        _alarm(
            "ApiHighLatencyAlarm",
            http_api.metric_latency(period=cdk.Duration.minutes(5), statistic="p99"),
            threshold=3000,
            evaluation_periods=2,
            description="ExpenseTrack HTTP API p99 latency stayed above 3s for 10 minutes",
        )

        # DynamoDB: on-demand billing means no capacity to size, but the
        # table can still throttle under a sudden burst above its
        # auto-scaled ceiling - worth knowing about even though it's rare.
        _alarm(
            "TableThrottledRequestsAlarm",
            table.metric_throttled_requests(period=cdk.Duration.minutes(5), statistic="Sum"),
            threshold=1,
            description="ExpenseTrack's DynamoDB table throttled at least one request in a 5 minute window",
        )

        cdk.CfnOutput(self, "AlertsTopicArn", value=topic.topic_arn)
