import { Duration, RemovalPolicy, Stack, StackProps, App } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import * as ecs from "aws-cdk-lib/aws-ecs";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import * as path from "path";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";

interface SolaceCustomAutoScalingConsumerStackProps extends StackProps {
  ecsVpc: ec2.Vpc;
}

export class SolaceCustomAutoScalingConsumerStack extends Stack {
  constructor(
    scope: App,
    id: string,
    props: SolaceCustomAutoScalingConsumerStackProps
  ) {
    super(scope, id, props);

    /**
     * Start Solace Sample
     */

    const solaceQueueClient = new DockerImageAsset(
      this,
      "SolaceCustomScalerQClientjsDockerImage",
      {
        directory: path.join(
          __dirname,
          "..",
          "resources",
          "solace-demo",
          "ecs-client"
        ),
      }
    );

    const solaceClientCluster = new ecs.Cluster(
      this,
      "hspencerCustomScalerSolaceClientCluster",
      {
        vpc: props.ecsVpc,
        clusterName: "hspencerCustomScalerSolaceClientCluster",
        containerInsights: true,
      }
    );

    const solaceClientLogGroup = new LogGroup(
      this,
      "hspencerCustomScalerSolaceClientFargateLogGroup",
      {
        logGroupName: "hspencerCustomScalerSolaceClientLogGroup",
        removalPolicy: RemovalPolicy.DESTROY,
      }
    );

    const solaceClientTaskDef = new ecs.FargateTaskDefinition(
      this,
      "hspencerCustomScalerSolaceClientFargateTaskDef",
      {
        cpu: 512,
        memoryLimitMiB: 1024,
        runtimePlatform: {
          cpuArchitecture: ecs.CpuArchitecture.ARM64,
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        },
      }
    );

    const solaceClientContainer = new ecs.ContainerDefinition(
      this,
      "hspencerCustomScalerSolaceClientContainer",
      {
        image: ecs.ContainerImage.fromDockerImageAsset(solaceQueueClient),
        taskDefinition: solaceClientTaskDef,
        environment: {
          // TODO: update environment variables
          QUEUE_NAME: "ecsQ2",
          SERVICE_URL:
            "wss://mr-connection-6y32tpb05yv.messaging.solace.cloud:443",
          USER_NAME: "solace-cloud-client",
          PASSWORD: "",
          VPN_NAME: "pq-demo",
        },
        logging: new ecs.AwsLogDriver({
          logGroup: solaceClientLogGroup,
          streamPrefix: "hspencerSolaceClientFargateLogGroup",
        }),
        healthCheck: {
          command: [
            "CMD-SHELL",
            "curl -f http://localhost:3000/health || exit 1",
          ],
          startPeriod: Duration.seconds(15),
        },
      }
    );

    const solaceClientService = new ecs.FargateService(
      this,
      "hspencerCustomScalerSolaceClientService",
      {
        taskDefinition: solaceClientTaskDef,
        cluster: solaceClientCluster,
        platformVersion: ecs.FargatePlatformVersion.VERSION1_4,
        serviceName: "hspenceCustomScalerSolaceClientService",
        desiredCount: 1,
      }
    );

    const serviceAutoScalingTask = solaceClientService.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 100,
    });

    //  Create Custom ECS Scaler application as ECS Scaler Task
    const solaceEcsScaler = new DockerImageAsset(
      this,
      "SolaceEcsScalerDockerImage",
      {
        directory: path.join(
          __dirname,
          "..",
          "resources",
          "solace-demo",
          "ecs-scaler"
        ),
      }
    );

    const solaceEcsScalerTaskDef = new ecs.FargateTaskDefinition(
      this,
      "SolaceECSScalerDockerImageFargateTaskDef",
      {
        cpu: 512,
        memoryLimitMiB: 1024,
        runtimePlatform: {
          cpuArchitecture: ecs.CpuArchitecture.ARM64,
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        },
      }
    );

    const solaceEcsSCalerLogGroup = new LogGroup(
      this,
      "hspencerSolaceEcsScalerFargateLogGroup",
      {
        logGroupName: "hspencerSolaceEcsScalerLogGroup",
        removalPolicy: RemovalPolicy.DESTROY,
      }
    );

    const solaceEcsScalerContainer = new ecs.ContainerDefinition(
      this,
      "hspencerSolaceEcsScalerContainer",
      {
        image: ecs.ContainerImage.fromDockerImageAsset(solaceEcsScaler),
        taskDefinition: solaceEcsScalerTaskDef,
        environment: {
          SEMP_URL:
            "https://mr-connection-6y32tpb05yv.messaging.solace.cloud:943",
          SEMP_ADMIN_USERNAME: "pq-demo-admin",
          SEMP_ADMIN_PASSWORD: "",
          VPN_NAME: "pq-demo",
          ECS_CLUSTER: solaceClientCluster.clusterName,
          ECS_SERVICE: solaceClientService.serviceName,
          QUEUE_NAME: "ecsQ2",
        },
        logging: new ecs.AwsLogDriver({
          logGroup: solaceEcsSCalerLogGroup,
          streamPrefix: "hspencerEcsScalerSoalceFargateLogGroup",
        }),
      }
    );

    const solaceEcsScalerService = new ecs.FargateService(
      this,
      "hspencerSolaceEcsScalerService",
      {
        taskDefinition: solaceEcsScalerTaskDef,
        cluster: solaceClientCluster,
        platformVersion: ecs.FargatePlatformVersion.VERSION1_4,
        serviceName: "hspenceSolaceEcsScalerService",
        desiredCount: 1,
      }
    );

    solaceEcsScalerService.taskDefinition.addToTaskRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "ecs:ListTasks",
          "ecs:UpdateService",
          "cloudwatch:GetMetricData",
          "cloudwatch:GetMetricStatistics",
        ],
        effect: iam.Effect.ALLOW,
        resources: ["*"],
      })
    );
  }
}
