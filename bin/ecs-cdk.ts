#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { EcsCdkStack } from '../lib/ecs-cdk-stack';

const app = new cdk.App();
new EcsCdkStack(app, 'EcsCdkStack');
