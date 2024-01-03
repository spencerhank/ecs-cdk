import {Duration,RemovalPolicy, Stack, StackProps, App } from 'aws-cdk-lib';
import { ApiKeySourceType } from 'aws-cdk-lib/aws-apigateway';
import { ApiGatewayToSqs, ApiGatewayToSqsProps } from "@aws-solutions-constructs/aws-apigateway-sqs";
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import * as path from 'path';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export class VpcStack extends Stack {
    public readonly ecsVpc: ec2.Vpc;

constructor(scope: App, id:string, props?: StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "ecsVpc", {
        maxAzs: 2
      });
      this.ecsVpc = vpc;

}
}