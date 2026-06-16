#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { StudentPipelineStack } from '../lib/student-pipeline-stack';

const app = new cdk.App();

// Get student ID from context or use default
const studentId = app.node.tryGetContext('studentId') || 'estudiante1';

// Use existing stack name for now (change to StudentPipelineStack-${studentId} for new deployments)
new StudentPipelineStack(app, 'StudentPipelineStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  description: `Student learning project for AWS CodePipeline - ${studentId}`
});
