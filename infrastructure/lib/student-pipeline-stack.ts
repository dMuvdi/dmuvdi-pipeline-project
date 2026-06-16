import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline';
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';

export class StudentPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // STUDENT CONFIGURATION - Update these values with your information
    const studentId = 'estudiante1'; // Change this to your unique identifier (e.g., 'juan-perez', 'maria-garcia')
    const githubOwner = 'Lion-geek';
    const githubRepo = 'student-pipeline-project';
    const githubBranch = 'main';
    
    // Note: You need to create a CodeStar Connection manually in AWS Console first
    // Go: Developer Tools > Connections > Create connection
    // Then paste the ARN here
    // IMPORTANT: Replace with your actual CodeStar Connection ARN
    const codestarConnectionArn = 'arn:aws:codeconnections:us-east-1:464037860466:connection/4f6760c6-d9a7-439e-95e2-e24409aec7b8';
    
    // S3 bucket for pipeline artifacts (unique per student)
    const artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
      bucketName: `student-pipeline-artifacts-${studentId}-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // S3 bucket for website hosting (unique per student)
    const websiteBucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: `student-pipeline-website-${studentId}-${this.account}`,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      publicReadAccess: true,
      blockPublicAccess: {
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Custom cache policy for faster updates (5 minutes instead of 24 hours)
    const customCachePolicy = new cloudfront.CachePolicy(this, 'CustomCachePolicy', {
      cachePolicyName: `student-cache-policy-${studentId}`,
      comment: 'Cache policy for student learning - 5 minute TTL',
      defaultTtl: cdk.Duration.minutes(5),
      minTtl: cdk.Duration.seconds(1),
      maxTtl: cdk.Duration.minutes(10),
      cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      headerBehavior: cloudfront.CacheHeaderBehavior.none(),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
    });

    // CloudFront distribution for the website
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(websiteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: customCachePolicy,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
      // PriceClass_100: North America and Europe only (most cost-effective for students)
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      comment: `Student Pipeline Distribution - ${studentId}`,
    });

    // SNS Topic for approval notifications (unique per student)
    const approvalTopic = new sns.Topic(this, 'ApprovalTopic', {
      displayName: `Pipeline Approval - ${studentId}`,
      topicName: `student-pipeline-approvals-${studentId}`,
    });

    // Subscribe email for approval notifications (students should update this)
    // approvalTopic.addSubscription(
    //   new subscriptions.EmailSubscription('your-email@example.com')
    // );

    // CodeBuild Project (unique per student)
    const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
      projectName: `student-pipeline-build-${studentId}`,
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_7_0,
        computeType: codebuild.ComputeType.SMALL,
      },
      buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yml'),
    });

    // Pipeline artifacts
    const sourceOutput = new codepipeline.Artifact('SourceOutput');
    const buildOutput = new codepipeline.Artifact('BuildOutput');

    // CodePipeline (unique per student)
    const pipeline = new codepipeline.Pipeline(this, 'Pipeline', {
      pipelineName: `student-learning-pipeline-${studentId}`,
      artifactBucket: artifactBucket,
      stages: [
        {
          stageName: 'Source',
          actions: [
            new codepipeline_actions.CodeStarConnectionsSourceAction({
              actionName: 'GitHub_Source',
              owner: githubOwner,
              repo: githubRepo,
              branch: githubBranch,
              connectionArn: codestarConnectionArn,
              output: sourceOutput,
              triggerOnPush: true, // Enable automatic trigger on push
            }),
          ],
        },
        {
          stageName: 'Build',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'Build',
              project: buildProject,
              input: sourceOutput,
              outputs: [buildOutput],
            }),
          ],
        },
        // EXERCISE 1: Add a Test stage here
        {
          stageName: 'Approval',
          actions: [
            new codepipeline_actions.ManualApprovalAction({
              actionName: 'Manual_Approval',
              notificationTopic: approvalTopic,
              additionalInformation: 'Por favor revisa los cambios y aprueba el despliegue a producción.',
            }),
          ],
        },
        {
          stageName: 'Deploy',
          actions: [
            new codepipeline_actions.S3DeployAction({
              actionName: 'Deploy_to_S3',
              bucket: websiteBucket,
              input: buildOutput,
              extract: true,
            }),
          ],
        },
      ],
    });

    // Grant CloudFront invalidation permissions to the pipeline
    websiteBucket.grantReadWrite(buildProject);

    // Note: CodeStar Connections should trigger automatically with triggerOnPush: true
    // If it doesn't work, students can use the run-pipeline.sh script

    // Outputs
    new cdk.CfnOutput(this, 'PipelineUrl', {
      value: `https://console.aws.amazon.com/codesuite/codepipeline/pipelines/${pipeline.pipelineName}/view`,
      description: 'CodePipeline Console URL',
    });

    new cdk.CfnOutput(this, 'WebsiteBucketUrl', {
      value: websiteBucket.bucketWebsiteUrl,
      description: 'S3 Website URL',
    });

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront Distribution URL (recommended)',
    });

    new cdk.CfnOutput(this, 'WebsiteBucketName', {
      value: websiteBucket.bucketName,
      description: 'S3 Bucket Name',
    });

    new cdk.CfnOutput(this, 'ApprovalTopicArn', {
      value: approvalTopic.topicArn,
      description: 'SNS Topic ARN for approval notifications',
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: distribution.distributionId,
      description: 'CloudFront Distribution ID (for manual cache invalidation)',
    });

    new cdk.CfnOutput(this, 'CacheInvalidationCommand', {
      value: `aws cloudfront create-invalidation --distribution-id ${distribution.distributionId} --paths "/*"`,
      description: 'Command to manually invalidate CloudFront cache',
    });
  }
}
