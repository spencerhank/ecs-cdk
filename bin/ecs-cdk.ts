#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { SqsAutoScalingConsumerStack } from '../lib/sqs-autoscaling-consumer-stack';
import { VpcStack } from '../lib/vpc-stack';
import { SolaceAutoScalingConsumerStack } from '../lib/solace-autoscaling-consumer-stack';

const app = new cdk.App();

const vpcStack = new VpcStack(app, 'EcsAutoScalingVpcStack', {
    env: {
        account: '804666467877',
        region: 'us-east-2'
    }
});

const sqsAutoScalingConsumerStack = new SqsAutoScalingConsumerStack(app, 'SqsAutoScalingConsumerStack', {
    ecsVpc: vpcStack.ecsVpc,
    env: {
        account: '804666467877',
        region: 'us-east-2'
    }
});
sqsAutoScalingConsumerStack.addDependency(vpcStack);

const solaceAutoScalingConsumerStack = new SolaceAutoScalingConsumerStack(app, 'SolaceAutoScalingConsumerStack', {
    ecsVpc: vpcStack.ecsVpc,
    env: {
        account: '804666467877',
        region: 'us-east-2'
    }
});
solaceAutoScalingConsumerStack.addDependency(vpcStack);
