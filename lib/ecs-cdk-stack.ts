import {Duration,RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import * as path from 'path';
import { ApiGatewayToSqs, ApiGatewayToSqsProps } from "@aws-solutions-constructs/aws-apigateway-sqs";
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { AdjustmentType } from 'aws-cdk-lib/aws-autoscaling';
import { ApiKeySourceType } from 'aws-cdk-lib/aws-apigateway';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { SqsMetricHandler } from './sqs-metric-handler';

export class EcsCdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);


    /**
     * Start SQS Sample
     */
    const apigatewayToSqs = new ApiGatewayToSqs(this, 'ApiGatewayToSqsPattern', {
      apiGatewayProps: {
        apiKeySourceType: ApiKeySourceType.HEADER,
        defaultMethodOptions: {
          apiKeyRequired: true,
          authorizationType: 'NONE'

        }
      },
      queueProps: {
        fifo: true
      },
      deadLetterQueueProps: {
        fifo: true
      },
      allowCreateOperation: true,
      createRequestTemplate: 'Action=SendMessage&MessageBody=$util.urlEncode(\"$input.body\")&MessageGroupId=$input.params(\"MessageGroupId\")&MessageDeduplicationId=$input.params(\"MessageDeduplicationId\")',
      additionalCreateRequestTemplates: {
        "application/x-www-form-urlencoded": 'Action=SendMessage&MessageBody=$input.body&MessageGroupId=$input.params(\"MessageGroupId\")&MessageDeduplicationId=$input.params(\"MessageDeduplicationId\")'
      },
      deployDeadLetterQueue: true,
      maxReceiveCount: 5
    });

    const asset = new DockerImageAsset(this, "jsDockerImage", {
      directory: path.join(__dirname, "..")
    });

    const vpc = new ec2.Vpc(this, "ecsVpc", {
      maxAzs: 2
    });

    const cluster = new ecs.Cluster(this, "hspencerecsCluster", {
      vpc: vpc,
      clusterName: "hspencerSqsConsumerCluster",
      containerInsights: true
    });

    const logGroup = new LogGroup(this, "hspencerFargateLogGroup", {
      logGroupName: "hspencerSqsConsumerLogGroup",
      removalPolicy: RemovalPolicy.DESTROY
    });

    const taskDef = new ecs.FargateTaskDefinition(this, "hspencerSqsConsuemrFargateTaskDef", {
      cpu: 512,
      memoryLimitMiB: 1024,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX
      }

    });
    // Allow task to consume messsages from sqs
    apigatewayToSqs.sqsQueue.grantConsumeMessages(taskDef.taskRole)

    const container = new ecs.ContainerDefinition(this, "hspencerSqsConsumerContainer", {
      image: ecs.ContainerImage.fromDockerImageAsset(asset),
      taskDefinition: taskDef,
      environment: {
        SQS_URL: apigatewayToSqs.sqsQueue.queueUrl
      },
      logging: new ecs.AwsLogDriver({
        logGroup: logGroup,
        streamPrefix: "hspencerSQSConsumer"
      })
    })

    const myService = new ecs.FargateService(this, "hspencerFargateService", {
      taskDefinition: taskDef,
      cluster: cluster,
      platformVersion: ecs.FargatePlatformVersion.VERSION1_4,
      serviceName: "hspencerSqsConsumerService",
      desiredCount: 0
    })

    const serviceAutoScalingTask = myService.autoScaleTaskCount({
      minCapacity: 0,
      maxCapacity: 10
    });

    const backogPerTaskCloudwatchMetric = new cloudwatch.Metric({
      metricName: 'sqsBacklogPerFargateTask',
      namespace:  'sqsAutoScaling',
      statistic: cloudwatch.Stats.AVERAGE,
      period: Duration.minutes(1),
      dimensionsMap: {
        ECSClusterName: cluster.clusterName,
        ECSServiceName: myService.serviceName
      } 
    })

    // serviceAutoScalingTask.scaleToTrackCustomMetric("QueueMessagesPerInstance", {
    //   metric: backogPerTaskCloudwatchMetric,
    //   targetValue: 5,
    //   scaleInCooldown: Duration.seconds(180),
    //   scaleOutCooldown: Duration.seconds(180)
    // })

    // Metric based on sqs backlog per running task
    serviceAutoScalingTask.scaleOnMetric("QueueMessagesVisibileScaling", {
      metric: backogPerTaskCloudwatchMetric,
      adjustmentType: AdjustmentType.PERCENT_CHANGE_IN_CAPACITY,
      minAdjustmentMagnitude: 1,
      // cooldown: Duration.seconds(120),
      scalingSteps: [
        {upper: 0, change: -100},
        {lower: 0, upper: 10, change: +20},
        {lower: 10, upper: 100, change: +50}
      ]
    })

    // resources required for metric based on sqs backlog per running instance

    // lambda for gathering messages
    // const lambdaMetricHandler = new NodejsFunction(this, "sqs-metric-handler", {
    //   entry : 'lambda-functions/sqs-metric-handler/index.js',
    //   runtime: lambda.Runtime.NODEJS_18_X,
    //   environment: {
    //     QUEUE_URL: apigatewayToSqs.sqsQueue.queueUrl,
    //     ECS_SERVICE_NAME: myService.serviceName,
    //     ECS_CLUSTER_NAME: cluster.clusterName,
    //     ACCEPTABLE_LATENCY: '10',
    //     AVERAGE_PROCESSING_TIME: '10',
    //     METRIC_NAMESPACE: 'sqsAutoScaling',
    //     METRIC_NAME: 'sqsBacklogPerFargateTask',
    //     METRIC_UNIT: 'Count'

    //   }
    // })
    // apigatewayToSqs.sqsQueue.grantSendMessages(lambdaMetricHandler);
    // lambdaMetricHandler.addToRolePolicy(new iam.PolicyStatement({
    //   actions: [ 'ecs:ListTasks', "ecs:UpdateService", "cloudwatch:PutMetricData" ],
    //   effect: iam.Effect.ALLOW,
    //   resources: ["*"]
    // }))
    // // eventbridge scheduled task to trigger lambda
    // const rule = new events.Rule(this, "EventBridgeScheduleForLambdaMetric", {
    //   schedule: events.Schedule.cron({minute: '0/5'})
    // });
    // rule.addTarget(new eventTargets.LambdaFunction(lambdaMetricHandler))
    const sqsMetricHandler = new SqsMetricHandler(this, "SqsMetricHandler", {
      acceptableLatency: '10',
      averageProcessingTime: '10',
      metricNameSpace: backogPerTaskCloudwatchMetric.namespace,
      metricName: backogPerTaskCloudwatchMetric.metricName,
      metricUnit: 'Count',
      lambdaEntry: 'lambda-functions/sqs-metric-handler/index.js',
      sqsQueue: apigatewayToSqs.sqsQueue,
      ecsServiceName: myService.serviceName,
      ecsClusterName: cluster.clusterName
    })
    // end defining lambda for gathering sqs messages

    /**
     * End SQS Sample
     */

    /**
     * Start Solace Sample
     */

    const solaceQueueClient = new DockerImageAsset(this, "SolaceQClientjsDockerImage", {
      directory: path.join(__dirname, "..", "solace-ecs-client")
    });


    const solaceClientCluster = new ecs.Cluster(this, "hspencerSolaceClientCluster", {
      vpc: vpc,
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

    const solaceCientService = new ecs.FargateService(this, "hspencerSolaceCientCluster", {
      taskDefinition: solaceClientTaskDef,
      cluster: solaceClientCluster,
      platformVersion: ecs.FargatePlatformVersion.VERSION1_4,
      serviceName: "hspencerSolaceCientService",
      desiredCount: 1
    })


    // const apigatewayToLambda = new ApiGatewayToLambda(this, 'ApiGatewayToLambdaPattern', {
    //   apiGatewayProps: {
    //     restApiName: 'hspencerLambdaApi',
    //     ApiKeySourceType: ApiKeySourceType.HEADER,
    //     defaultMethodOptions: {
    //       apiKeyRequired: true,
    //       authorizationType: 'NONE'
    //     }
    //   },
    //   lambdaFunctionProps: {
    //     runtime: lambda.Runtime.NODEJS_20_X,
    //     handler: 'index.handler',
    //     code: lambda.Code.fromAsset('lambda-functions')

    //   }
    // })
  }
}

// next steps
// 1. create custom autoscaling group to scale fargate task