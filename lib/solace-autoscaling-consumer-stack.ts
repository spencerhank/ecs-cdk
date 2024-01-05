import {Duration,RemovalPolicy, Stack, StackProps, App } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as path from 'path';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { AdjustmentType } from 'aws-cdk-lib/aws-applicationautoscaling';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventTargets from 'aws-cdk-lib/aws-events-targets';

interface SolaceAutoScalingConsumerStackProps extends StackProps {
    ecsVpc : ec2.Vpc
}

export class SolaceAutoScalingConsumerStack extends Stack {
    constructor(scope: App, id: string, props: SolaceAutoScalingConsumerStackProps) {
        super(scope, id, props);

        /**
     * Start Solace Sample
     */

    const solaceQueueClient = new DockerImageAsset(this, "SolaceQClientjsDockerImage", {
        directory: path.join(__dirname, "..", "resources", "solace-demo", "ecs-client")
      });

      const solaceClientCluster = new ecs.Cluster(this, "hspencerSolaceClientCluster", {
        vpc: props.ecsVpc,
        clusterName: "hspencerSolaceClientCluster",
        containerInsights: true
      });
  
      const solaceClientLogGroup = new LogGroup(this, "hspencerSolaceClientFargateLogGroup", {
        logGroupName: "hspencerSolaceClientLogGroup",
        removalPolicy: RemovalPolicy.DESTROY
      });
  
      const solaceClientTaskDef = new ecs.FargateTaskDefinition(this, "hspencerSolaceClientFargateTaskDef", {
        cpu: 512,
        memoryLimitMiB: 1024,
        runtimePlatform: {
          cpuArchitecture: ecs.CpuArchitecture.ARM64,
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX
        }
  
      });
  
      const solaceClientContainer = new ecs.ContainerDefinition(this, "hspencerSolaceClientContainer", {
        image: ecs.ContainerImage.fromDockerImageAsset(solaceQueueClient),
        taskDefinition: solaceClientTaskDef,
        environment: {
          // TODO: update environment variables
          QUEUE_NAME: 'ecsQ',
          SERVICE_URL: 'wss://mr-connection-4e44l2r0j7d.messaging.solace.cloud:443',
          USER_NAME: 'solace-cloud-client',
          PASSWORD: '67l15rubjqeki03l5ouqovj46n',
          VPN_NAME: 'aws-us-east-1'
        },
        logging: new ecs.AwsLogDriver({
          logGroup: solaceClientLogGroup,
          streamPrefix: "hspencerSolaceClientFargateLogGroup"
        })
      })
  
      const solaceClientService = new ecs.FargateService(this, "hspencerSolaceCientCluster", {
        taskDefinition: solaceClientTaskDef,
        cluster: solaceClientCluster,
        platformVersion: ecs.FargatePlatformVersion.VERSION1_4,
        serviceName: "hspencerSolaceCientService",
        desiredCount: 1
      })

      const serviceAutoScalingTask = solaceClientService.autoScaleTaskCount({
        minCapacity: 1,
        maxCapacity: 10
      });

      const backlogPerTaskCloudwatchMetric = new cloudwatch.Metric({
        metricName: 'solaceQBacklogPerFargateTask',
        namespace: 'solaceConsumerAutoscaling',
        statistic: cloudwatch.Stats.AVERAGE,
        period: Duration.minutes(1),
        dimensionsMap: {
          ECSClusterName: solaceClientCluster.clusterName,
          ECSServiceName: solaceClientService.serviceName
        }
      })

  

      serviceAutoScalingTask.scaleOnMetric("SolaceQueueMessageBacklogScaling", {
        metric: backlogPerTaskCloudwatchMetric,
        adjustmentType: AdjustmentType.PERCENT_CHANGE_IN_CAPACITY,
        minAdjustmentMagnitude: 1,
        // cooldown: Duration.seconds(120),
        scalingSteps: [
          {lower: 0, upper: 0, change: -100},
          {lower: 1, upper: 10, change: +20},
          {lower: 10, change: +50}
        ]
      })

      const solaceMetricHandler = new NodejsFunction(this, "SolaceQueueBacklogMetricHandler", {
        entry: 'resources/solace-demo/lambda-function/solace-metric-handler/index.js',
        runtime: lambda.Runtime.NODEJS_18_X,
        environment: {
          ECS_SERVICE_NAME: solaceClientService.serviceName,
          ECS_CLUSTER_NAME: solaceClientCluster.clusterName,
          ACCEPTABLE_LATENCY: '10',
          AVERAGE_PROCESSING_TIME: '.1',
          METRIC_NAMESPACE: backlogPerTaskCloudwatchMetric.namespace,
          METRIC_NAME: backlogPerTaskCloudwatchMetric.metricName,
          METRIC_UNIT: 'Count',
          SOLACE_MESSAGE_VPN_NAME: 'aws-us-east-1',
          SOLACE_QUEUE_NAME: 'ecsQ',
          SOLACE_SEMP_URL: '<update>',
          SOLACE_SEMP_PORT: '943',
          SOLACE_ADMIN_USERNAME: '<update>>',
          SOLACE_ADMIN_PASSWORD: '<update>>'
          
        }
      })

      solaceMetricHandler.addToRolePolicy(new iam.PolicyStatement({
        actions: [ 'ecs:ListTasks', "ecs:UpdateService", "cloudwatch:PutMetricData" ],
            effect: iam.Effect.ALLOW,
            resources: ["*"]
      }));

      const solaceMetricHandlerScheduledTask = new events.Rule(this, "SchedulerForSolaceQueueBacklogMetricHandler", {
        schedule: events.Schedule.cron({minute: '0/1'})
      });
      solaceMetricHandlerScheduledTask.addTarget(new eventTargets.LambdaFunction(solaceMetricHandler));

    }

}