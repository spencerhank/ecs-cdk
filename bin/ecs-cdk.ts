#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { SqsAutoScalingConsumerStack } from "../lib/sqs-autoscaling-consumer-stack";
import { VpcStack } from "../lib/vpc-stack";
import { SolaceAWSAutoScalingConsumerStack } from "../lib/solace-aws-autoscaling-consumer-stack";
import { SolaceCustomAutoScalingConsumerStack } from "../lib/solace-custom-autoscaling-consumer-stack";

const app = new cdk.App();

const accountId = "";

const vpcStack = new VpcStack(app, "EcsAutoScalingVpcStack", {
  env: {
    account: accountId,
    region: "us-east-2",
  },
});

const sqsAutoScalingConsumerStack = new SqsAutoScalingConsumerStack(
  app,
  "SqsAutoScalingConsumerStack",
  {
    ecsVpc: vpcStack.ecsVpc,
    env: {
      account: accountId,
      region: "us-east-2",
    },
  }
);
sqsAutoScalingConsumerStack.addDependency(vpcStack);

const solaceAutoScalingConsumerStack = new SolaceAWSAutoScalingConsumerStack(
  app,
  "SolaceAWSAutoScalingConsumerStack",
  {
    ecsVpc: vpcStack.ecsVpc,
    env: {
      account: accountId,
      region: "us-east-2",
    },
  }
);
solaceAutoScalingConsumerStack.addDependency(vpcStack);

const solaceCustomAutoScalingConsumerStack =
  new SolaceCustomAutoScalingConsumerStack(
    app,
    "SolaceCustomAutoScalingConsumerStack",
    {
      ecsVpc: vpcStack.ecsVpc,
      env: {
        account: accountId,
        region: "us-east-2",
      },
    }
  );
solaceCustomAutoScalingConsumerStack.addDependency(vpcStack);
