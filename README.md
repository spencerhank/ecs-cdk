# Welcome to your CDK TypeScript project

You should explore the contents of this project. It demonstrates a CDK app with an instance of a stack (`EcsCdkStack`)
which contains an Amazon SQS queue that is subscribed to an Amazon SNS topic.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test` perform the jest unit tests
- `cdk deploy` deploy this stack to your default AWS account/region
- `cdk diff` compare deployed stack with current state
- `cdk synth` emits the synthesized CloudFormation template

# Overview

Setup that provides horizontal scaling capabilities for applications deployed to AWS ECS consuming from either AWS SQS or a Solace Queue.

## Basic Design For Horizontal Scaling Based on SQS Queue Depth

### Basic Design taken from https://github.com/aws-samples/aws-ecs-auto-scaling-with-custom-metrics/tree/main

1. Deploy SQS FIFO Queue with API Gateway
   - API Gateway only requires valid API Key
2. Deploy application designed to consume messages from SQS Queue
   - Deployed to ECS via Fargate capacity provider
   - Desired count set to 1 initially
   - Deployed to same region as SQS queue
   - Fetches latest messages every 2 seconds
3. Deploy lambda that observes approximate number of available messages on the queue, determines the average number of messages on the SQS backlog per the number of running ecs tasks. Sends entry for custom metric to cloudwatch
   - Scheduled task kicked off by an event bridge rule
   - Acceptable number of backlog messages per running ecs task is configurable.
   - Custom metric is created as part of the cdk app and passed to the lambda via environment variables
4. Alarm and Autoscaling policy created using the custom metric to determine the number of desired ecs tasks
   - Autoscaling policy uses configurable scaling steps to increase or decrease percentage of available capacity
   - Returns capacity to 1 when SQS backlog is 0

## Basic Design For Horizontal Scaling Based on Solace Queue Depth

### Basic Design adapted from the SQS Example with the following differences

- No API Gateway deployed, only requried for SQS to facilitate adding messages tot he SQS queue
- Solace event broker pushes messages to consuming applications instead of forcing the application to fetch available messages
