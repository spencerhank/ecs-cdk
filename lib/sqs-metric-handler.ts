const {Fn} = require("aws-cdk-lib");
import {Construct} from "constructs";
import * as sqs from 'aws-cdk-lib/aws-sqs';
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventTargets from 'aws-cdk-lib/aws-events-targets';

export interface SqsMetricHandlerProps {
    acceptableLatency: string,
    averageProcessingTime: string,
    metricNameSpace: string,
    metricName: string,
    metricUnit: string,
    lambdaEntry: string,
    sqsQueue: sqs.Queue,
    ecsServiceName: string,
    ecsClusterName: string
    

}

export class SqsMetricHandler extends Construct {
    sqsMetricHandler: NodejsFunction;
    

    constructor(scope: Construct, id: string, props: SqsMetricHandlerProps) {
        super(scope, id);

        this.sqsMetricHandler = new NodejsFunction(this, "MetricHandler", {
            entry: props.lambdaEntry,
            runtime: lambda.Runtime.NODEJS_18_X,
            environment: {
                QUEUE_URL: props.sqsQueue.queueUrl,
                ECS_SERVICE_NAME: props.ecsServiceName,
                ECS_CLUSTER_NAME: props.ecsClusterName,
                ACCEPTABLE_LATENCY: props.acceptableLatency,
                AVERAGE_PROCESSING_TIME: props.averageProcessingTime,
                METRIC_NAMESPACE: props.metricNameSpace,
                METRIC_NAME: props.metricName,
                METRIC_UNIT: props.metricUnit
            }
        });

        props.sqsQueue.grantSendMessages(this.sqsMetricHandler);

        this.sqsMetricHandler.addToRolePolicy(new iam.PolicyStatement({
            actions: [ 'ecs:ListTasks', "ecs:UpdateService", "cloudwatch:PutMetricData" ],
            effect: iam.Effect.ALLOW,
            resources: ["*"]
          }));

        const rule = new events.Rule(this, "EventBridgeScheduleForLambdaMetric", {
          schedule: events.Schedule.cron({minute: '0/3'})
        });
        rule.addTarget(new eventTargets.LambdaFunction(this.sqsMetricHandler));

    }
}