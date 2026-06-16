"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentPipelineStack = void 0;
const cdk = require("aws-cdk-lib");
const codepipeline = require("aws-cdk-lib/aws-codepipeline");
const codepipeline_actions = require("aws-cdk-lib/aws-codepipeline-actions");
const codebuild = require("aws-cdk-lib/aws-codebuild");
const s3 = require("aws-cdk-lib/aws-s3");
const cloudfront = require("aws-cdk-lib/aws-cloudfront");
const origins = require("aws-cdk-lib/aws-cloudfront-origins");
const sns = require("aws-cdk-lib/aws-sns");
class StudentPipelineStack extends cdk.Stack {
    constructor(scope, id, props) {
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
        const codestarConnectionArn = 'arn:aws:codeconnections:REGION:ACCOUNT_ID:connection/YOUR-CONNECTION-ID';
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
exports.StudentPipelineStack = StudentPipelineStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3R1ZGVudC1waXBlbGluZS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInN0dWRlbnQtcGlwZWxpbmUtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsbUNBQW1DO0FBRW5DLDZEQUE2RDtBQUM3RCw2RUFBNkU7QUFDN0UsdURBQXVEO0FBQ3ZELHlDQUF5QztBQUV6Qyx5REFBeUQ7QUFDekQsOERBQThEO0FBRTlELDJDQUEyQztBQUczQyxNQUFhLG9CQUFxQixTQUFRLEdBQUcsQ0FBQyxLQUFLO0lBQ2pELFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsb0VBQW9FO1FBQ3BFLE1BQU0sU0FBUyxHQUFHLGFBQWEsQ0FBQyxDQUFDLDZFQUE2RTtRQUM5RyxNQUFNLFdBQVcsR0FBRyxXQUFXLENBQUM7UUFDaEMsTUFBTSxVQUFVLEdBQUcsMEJBQTBCLENBQUM7UUFDOUMsTUFBTSxZQUFZLEdBQUcsTUFBTSxDQUFDO1FBRTVCLCtFQUErRTtRQUMvRSx3REFBd0Q7UUFDeEQsMEJBQTBCO1FBQzFCLDhEQUE4RDtRQUM5RCxNQUFNLHFCQUFxQixHQUFHLHlFQUF5RSxDQUFDO1FBRXhHLHdEQUF3RDtRQUN4RCxNQUFNLGNBQWMsR0FBRyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO1lBQzNELFVBQVUsRUFBRSw4QkFBOEIsU0FBUyxJQUFJLElBQUksQ0FBQyxPQUFPLEVBQUU7WUFDckUsYUFBYSxFQUFFLEdBQUcsQ0FBQyxhQUFhLENBQUMsT0FBTztZQUN4QyxpQkFBaUIsRUFBRSxJQUFJO1NBQ3hCLENBQUMsQ0FBQztRQUVILHFEQUFxRDtRQUNyRCxNQUFNLGFBQWEsR0FBRyxJQUFJLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUN6RCxVQUFV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UUFBUTtZQUM3QixXQUFXLEVBQUUsMENBQTBDO1NBQ3hELENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsMEJBQTBCLEVBQUU7WUFDbEQsS0FBSyxFQUFFLFlBQVksQ0FBQyxjQUFjO1lBQ2xDLFdBQVcsRUFBRSw0REFBNEQ7U0FDMUUsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSwwQkFBMEIsRUFBRTtZQUNsRCxLQUFLLEVBQUUsd0RBQXdELFlBQVksQ0FBQyxjQUFjLGVBQWU7WUFDekcsV0FBVyxFQUFFLGlEQUFpRDtTQUMvRCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFuTUQsb0RBbU1DIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgY29kZXBpcGVsaW5lIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2RlcGlwZWxpbmUnO1xuaW1wb3J0ICogYXMgY29kZXBpcGVsaW5lX2FjdGlvbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZGVwaXBlbGluZS1hY3Rpb25zJztcbmltcG9ydCAqIGFzIGNvZGVidWlsZCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29kZWJ1aWxkJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBzM2RlcGxveSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMtZGVwbG95bWVudCc7XG5pbXBvcnQgKiBhcyBjbG91ZGZyb250IGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250JztcbmltcG9ydCAqIGFzIG9yaWdpbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQtb3JpZ2lucyc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBzbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXNucyc7XG5pbXBvcnQgKiBhcyBzdWJzY3JpcHRpb25zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zbnMtc3Vic2NyaXB0aW9ucyc7XG5cbmV4cG9ydCBjbGFzcyBTdHVkZW50UGlwZWxpbmVTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIC8vIFNUVURFTlQgQ09ORklHVVJBVElPTiAtIFVwZGF0ZSB0aGVzZSB2YWx1ZXMgd2l0aCB5b3VyIGluZm9ybWF0aW9uXG4gICAgY29uc3Qgc3R1ZGVudElkID0gJ2VzdHVkaWFudGUxJzsgLy8gQ2hhbmdlIHRoaXMgdG8geW91ciB1bmlxdWUgaWRlbnRpZmllciAoZS5nLiwgJ2p1YW4tcGVyZXonLCAnbWFyaWEtZ2FyY2lhJylcbiAgICBjb25zdCBnaXRodWJPd25lciA9ICdMaW9uLWdlZWsnO1xuICAgIGNvbnN0IGdpdGh1YlJlcG8gPSAnc3R1ZGVudC1waXBlbGluZS1wcm9qZWN0JztcbiAgICBjb25zdCBnaXRodWJCcmFuY2ggPSAnbWFpbic7XG4gICAgXG4gICAgLy8gTm90ZTogWW91IG5lZWQgdG8gY3JlYXRlIGEgQ29kZVN0YXIgQ29ubmVjdGlvbiBtYW51YWxseSBpbiBBV1MgQ29uc29sZSBmaXJzdFxuICAgIC8vIEdvOiBEZXZlbG9wZXIgVG9vbHMgPiBDb25uZWN0aW9ucyA+IENyZWF0ZSBjb25uZWN0aW9uXG4gICAgLy8gVGhlbiBwYXN0ZSB0aGUgQVJOIGhlcmVcbiAgICAvLyBJTVBPUlRBTlQ6IFJlcGxhY2Ugd2l0aCB5b3VyIGFjdHVhbCBDb2RlU3RhciBDb25uZWN0aW9uIEFSTlxuICAgIGNvbnN0IGNvZGVzdGFyQ29ubmVjdGlvbkFybiA9ICdhcm46YXdzOmNvZGVjb25uZWN0aW9uczpSRUdJT046QUNDT1VOVF9JRDpjb25uZWN0aW9uL1lPVVItQ09OTkVDVElPTi1JRCc7XG4gICAgXG4gICAgLy8gUzMgYnVja2V0IGZvciBwaXBlbGluZSBhcnRpZmFjdHMgKHVuaXF1ZSBwZXIgc3R1ZGVudClcbiAgICBjb25zdCBhcnRpZmFjdEJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0FydGlmYWN0QnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYHN0dWRlbnQtcGlwZWxpbmUtYXJ0aWZhY3RzLSR7c3R1ZGVudElkfS0ke3RoaXMuYWNjb3VudH1gLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gUzMgYnVja2V0IGZvciB3ZWJzaXRlIGhvc3RpbmcgKHVuaXF1ZSBwZXIgc3R1ZGVudClcbiAgICBjb25zdCB3ZWJzaXRlQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnV2Vic2l0ZUJ1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGBzdHVkZW50LXBpcGVsaW5lLXdlYnNpdGUtJHtzdHVkZW50SWR9LSR7dGhpcy5hY2NvdW50fWAsXG4gICAgICB3ZWJzaXRlSW5kZXhEb2N1bWVudDogJ2luZGV4Lmh0bWwnLFxuICAgICAgd2Vic2l0ZUVycm9yRG9jdW1lbnQ6ICdpbmRleC5odG1sJyxcbiAgICAgIHB1YmxpY1JlYWRBY2Nlc3M6IHRydWUsXG4gICAgICBibG9ja1B1YmxpY0FjY2Vzczoge1xuICAgICAgICBibG9ja1B1YmxpY0FjbHM6IGZhbHNlLFxuICAgICAgICBibG9ja1B1YmxpY1BvbGljeTogZmFsc2UsXG4gICAgICAgIGlnbm9yZVB1YmxpY0FjbHM6IGZhbHNlLFxuICAgICAgICByZXN0cmljdFB1YmxpY0J1Y2tldHM6IGZhbHNlLFxuICAgICAgfSxcbiAgICAgIHJlbW92YWxQb2xpY3k6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogdHJ1ZSxcbiAgICB9KTtcblxuICAgIC8vIEN1c3RvbSBjYWNoZSBwb2xpY3kgZm9yIGZhc3RlciB1cGRhdGVzICg1IG1pbnV0ZXMgaW5zdGVhZCBvZiAyNCBob3VycylcbiAgICBjb25zdCBjdXN0b21DYWNoZVBvbGljeSA9IG5ldyBjbG91ZGZyb250LkNhY2hlUG9saWN5KHRoaXMsICdDdXN0b21DYWNoZVBvbGljeScsIHtcbiAgICAgIGNhY2hlUG9saWN5TmFtZTogYHN0dWRlbnQtY2FjaGUtcG9saWN5LSR7c3R1ZGVudElkfWAsXG4gICAgICBjb21tZW50OiAnQ2FjaGUgcG9saWN5IGZvciBzdHVkZW50IGxlYXJuaW5nIC0gNSBtaW51dGUgVFRMJyxcbiAgICAgIGRlZmF1bHRUdGw6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgbWluVHRsOiBjZGsuRHVyYXRpb24uc2Vjb25kcygxKSxcbiAgICAgIG1heFR0bDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMTApLFxuICAgICAgY29va2llQmVoYXZpb3I6IGNsb3VkZnJvbnQuQ2FjaGVDb29raWVCZWhhdmlvci5ub25lKCksXG4gICAgICBoZWFkZXJCZWhhdmlvcjogY2xvdWRmcm9udC5DYWNoZUhlYWRlckJlaGF2aW9yLm5vbmUoKSxcbiAgICAgIHF1ZXJ5U3RyaW5nQmVoYXZpb3I6IGNsb3VkZnJvbnQuQ2FjaGVRdWVyeVN0cmluZ0JlaGF2aW9yLm5vbmUoKSxcbiAgICAgIGVuYWJsZUFjY2VwdEVuY29kaW5nR3ppcDogdHJ1ZSxcbiAgICAgIGVuYWJsZUFjY2VwdEVuY29kaW5nQnJvdGxpOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgLy8gQ2xvdWRGcm9udCBkaXN0cmlidXRpb24gZm9yIHRoZSB3ZWJzaXRlXG4gICAgY29uc3QgZGlzdHJpYnV0aW9uID0gbmV3IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uKHRoaXMsICdEaXN0cmlidXRpb24nLCB7XG4gICAgICBkZWZhdWx0QmVoYXZpb3I6IHtcbiAgICAgICAgb3JpZ2luOiBuZXcgb3JpZ2lucy5TM09yaWdpbih3ZWJzaXRlQnVja2V0KSxcbiAgICAgICAgdmlld2VyUHJvdG9jb2xQb2xpY3k6IGNsb3VkZnJvbnQuVmlld2VyUHJvdG9jb2xQb2xpY3kuUkVESVJFQ1RfVE9fSFRUUFMsXG4gICAgICAgIGNhY2hlUG9saWN5OiBjdXN0b21DYWNoZVBvbGljeSxcbiAgICAgIH0sXG4gICAgICBkZWZhdWx0Um9vdE9iamVjdDogJ2luZGV4Lmh0bWwnLFxuICAgICAgZXJyb3JSZXNwb25zZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGh0dHBTdGF0dXM6IDQwNCxcbiAgICAgICAgICByZXNwb25zZUh0dHBTdGF0dXM6IDIwMCxcbiAgICAgICAgICByZXNwb25zZVBhZ2VQYXRoOiAnL2luZGV4Lmh0bWwnLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIC8vIFByaWNlQ2xhc3NfMTAwOiBOb3J0aCBBbWVyaWNhIGFuZCBFdXJvcGUgb25seSAobW9zdCBjb3N0LWVmZmVjdGl2ZSBmb3Igc3R1ZGVudHMpXG4gICAgICBwcmljZUNsYXNzOiBjbG91ZGZyb250LlByaWNlQ2xhc3MuUFJJQ0VfQ0xBU1NfMTAwLFxuICAgICAgY29tbWVudDogYFN0dWRlbnQgUGlwZWxpbmUgRGlzdHJpYnV0aW9uIC0gJHtzdHVkZW50SWR9YCxcbiAgICB9KTtcblxuICAgIC8vIFNOUyBUb3BpYyBmb3IgYXBwcm92YWwgbm90aWZpY2F0aW9ucyAodW5pcXVlIHBlciBzdHVkZW50KVxuICAgIGNvbnN0IGFwcHJvdmFsVG9waWMgPSBuZXcgc25zLlRvcGljKHRoaXMsICdBcHByb3ZhbFRvcGljJywge1xuICAgICAgZGlzcGxheU5hbWU6IGBQaXBlbGluZSBBcHByb3ZhbCAtICR7c3R1ZGVudElkfWAsXG4gICAgICB0b3BpY05hbWU6IGBzdHVkZW50LXBpcGVsaW5lLWFwcHJvdmFscy0ke3N0dWRlbnRJZH1gLFxuICAgIH0pO1xuXG4gICAgLy8gU3Vic2NyaWJlIGVtYWlsIGZvciBhcHByb3ZhbCBub3RpZmljYXRpb25zIChzdHVkZW50cyBzaG91bGQgdXBkYXRlIHRoaXMpXG4gICAgLy8gYXBwcm92YWxUb3BpYy5hZGRTdWJzY3JpcHRpb24oXG4gICAgLy8gICBuZXcgc3Vic2NyaXB0aW9ucy5FbWFpbFN1YnNjcmlwdGlvbigneW91ci1lbWFpbEBleGFtcGxlLmNvbScpXG4gICAgLy8gKTtcblxuICAgIC8vIENvZGVCdWlsZCBQcm9qZWN0ICh1bmlxdWUgcGVyIHN0dWRlbnQpXG4gICAgY29uc3QgYnVpbGRQcm9qZWN0ID0gbmV3IGNvZGVidWlsZC5QaXBlbGluZVByb2plY3QodGhpcywgJ0J1aWxkUHJvamVjdCcsIHtcbiAgICAgIHByb2plY3ROYW1lOiBgc3R1ZGVudC1waXBlbGluZS1idWlsZC0ke3N0dWRlbnRJZH1gLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgYnVpbGRJbWFnZTogY29kZWJ1aWxkLkxpbnV4QnVpbGRJbWFnZS5TVEFOREFSRF83XzAsXG4gICAgICAgIGNvbXB1dGVUeXBlOiBjb2RlYnVpbGQuQ29tcHV0ZVR5cGUuU01BTEwsXG4gICAgICB9LFxuICAgICAgYnVpbGRTcGVjOiBjb2RlYnVpbGQuQnVpbGRTcGVjLmZyb21Tb3VyY2VGaWxlbmFtZSgnYnVpbGRzcGVjLnltbCcpLFxuICAgIH0pO1xuXG4gICAgLy8gUGlwZWxpbmUgYXJ0aWZhY3RzXG4gICAgY29uc3Qgc291cmNlT3V0cHV0ID0gbmV3IGNvZGVwaXBlbGluZS5BcnRpZmFjdCgnU291cmNlT3V0cHV0Jyk7XG4gICAgY29uc3QgYnVpbGRPdXRwdXQgPSBuZXcgY29kZXBpcGVsaW5lLkFydGlmYWN0KCdCdWlsZE91dHB1dCcpO1xuXG4gICAgLy8gQ29kZVBpcGVsaW5lICh1bmlxdWUgcGVyIHN0dWRlbnQpXG4gICAgY29uc3QgcGlwZWxpbmUgPSBuZXcgY29kZXBpcGVsaW5lLlBpcGVsaW5lKHRoaXMsICdQaXBlbGluZScsIHtcbiAgICAgIHBpcGVsaW5lTmFtZTogYHN0dWRlbnQtbGVhcm5pbmctcGlwZWxpbmUtJHtzdHVkZW50SWR9YCxcbiAgICAgIGFydGlmYWN0QnVja2V0OiBhcnRpZmFjdEJ1Y2tldCxcbiAgICAgIHN0YWdlczogW1xuICAgICAgICB7XG4gICAgICAgICAgc3RhZ2VOYW1lOiAnU291cmNlJyxcbiAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICBuZXcgY29kZXBpcGVsaW5lX2FjdGlvbnMuQ29kZVN0YXJDb25uZWN0aW9uc1NvdXJjZUFjdGlvbih7XG4gICAgICAgICAgICAgIGFjdGlvbk5hbWU6ICdHaXRIdWJfU291cmNlJyxcbiAgICAgICAgICAgICAgb3duZXI6IGdpdGh1Yk93bmVyLFxuICAgICAgICAgICAgICByZXBvOiBnaXRodWJSZXBvLFxuICAgICAgICAgICAgICBicmFuY2g6IGdpdGh1YkJyYW5jaCxcbiAgICAgICAgICAgICAgY29ubmVjdGlvbkFybjogY29kZXN0YXJDb25uZWN0aW9uQXJuLFxuICAgICAgICAgICAgICBvdXRwdXQ6IHNvdXJjZU91dHB1dCxcbiAgICAgICAgICAgICAgdHJpZ2dlck9uUHVzaDogdHJ1ZSwgLy8gRW5hYmxlIGF1dG9tYXRpYyB0cmlnZ2VyIG9uIHB1c2hcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICBzdGFnZU5hbWU6ICdCdWlsZCcsXG4gICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgbmV3IGNvZGVwaXBlbGluZV9hY3Rpb25zLkNvZGVCdWlsZEFjdGlvbih7XG4gICAgICAgICAgICAgIGFjdGlvbk5hbWU6ICdCdWlsZCcsXG4gICAgICAgICAgICAgIHByb2plY3Q6IGJ1aWxkUHJvamVjdCxcbiAgICAgICAgICAgICAgaW5wdXQ6IHNvdXJjZU91dHB1dCxcbiAgICAgICAgICAgICAgb3V0cHV0czogW2J1aWxkT3V0cHV0XSxcbiAgICAgICAgICAgIH0pLFxuICAgICAgICAgIF0sXG4gICAgICAgIH0sXG4gICAgICAgIC8vIEVYRVJDSVNFIDE6IEFkZCBhIFRlc3Qgc3RhZ2UgaGVyZVxuICAgICAgICB7XG4gICAgICAgICAgc3RhZ2VOYW1lOiAnQXBwcm92YWwnLFxuICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgIG5ldyBjb2RlcGlwZWxpbmVfYWN0aW9ucy5NYW51YWxBcHByb3ZhbEFjdGlvbih7XG4gICAgICAgICAgICAgIGFjdGlvbk5hbWU6ICdNYW51YWxfQXBwcm92YWwnLFxuICAgICAgICAgICAgICBub3RpZmljYXRpb25Ub3BpYzogYXBwcm92YWxUb3BpYyxcbiAgICAgICAgICAgICAgYWRkaXRpb25hbEluZm9ybWF0aW9uOiAnUG9yIGZhdm9yIHJldmlzYSBsb3MgY2FtYmlvcyB5IGFwcnVlYmEgZWwgZGVzcGxpZWd1ZSBhIHByb2R1Y2Npw7NuLicsXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgc3RhZ2VOYW1lOiAnRGVwbG95JyxcbiAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICBuZXcgY29kZXBpcGVsaW5lX2FjdGlvbnMuUzNEZXBsb3lBY3Rpb24oe1xuICAgICAgICAgICAgICBhY3Rpb25OYW1lOiAnRGVwbG95X3RvX1MzJyxcbiAgICAgICAgICAgICAgYnVja2V0OiB3ZWJzaXRlQnVja2V0LFxuICAgICAgICAgICAgICBpbnB1dDogYnVpbGRPdXRwdXQsXG4gICAgICAgICAgICAgIGV4dHJhY3Q6IHRydWUsXG4gICAgICAgICAgICB9KSxcbiAgICAgICAgICBdLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IENsb3VkRnJvbnQgaW52YWxpZGF0aW9uIHBlcm1pc3Npb25zIHRvIHRoZSBwaXBlbGluZVxuICAgIHdlYnNpdGVCdWNrZXQuZ3JhbnRSZWFkV3JpdGUoYnVpbGRQcm9qZWN0KTtcblxuICAgIC8vIE5vdGU6IENvZGVTdGFyIENvbm5lY3Rpb25zIHNob3VsZCB0cmlnZ2VyIGF1dG9tYXRpY2FsbHkgd2l0aCB0cmlnZ2VyT25QdXNoOiB0cnVlXG4gICAgLy8gSWYgaXQgZG9lc24ndCB3b3JrLCBzdHVkZW50cyBjYW4gdXNlIHRoZSBydW4tcGlwZWxpbmUuc2ggc2NyaXB0XG5cbiAgICAvLyBPdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1BpcGVsaW5lVXJsJywge1xuICAgICAgdmFsdWU6IGBodHRwczovL2NvbnNvbGUuYXdzLmFtYXpvbi5jb20vY29kZXN1aXRlL2NvZGVwaXBlbGluZS9waXBlbGluZXMvJHtwaXBlbGluZS5waXBlbGluZU5hbWV9L3ZpZXdgLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2RlUGlwZWxpbmUgQ29uc29sZSBVUkwnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1dlYnNpdGVCdWNrZXRVcmwnLCB7XG4gICAgICB2YWx1ZTogd2Vic2l0ZUJ1Y2tldC5idWNrZXRXZWJzaXRlVXJsLFxuICAgICAgZGVzY3JpcHRpb246ICdTMyBXZWJzaXRlIFVSTCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ2xvdWRGcm9udFVybCcsIHtcbiAgICAgIHZhbHVlOiBgaHR0cHM6Ly8ke2Rpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0Nsb3VkRnJvbnQgRGlzdHJpYnV0aW9uIFVSTCAocmVjb21tZW5kZWQpJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdXZWJzaXRlQnVja2V0TmFtZScsIHtcbiAgICAgIHZhbHVlOiB3ZWJzaXRlQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ1MzIEJ1Y2tldCBOYW1lJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBcHByb3ZhbFRvcGljQXJuJywge1xuICAgICAgdmFsdWU6IGFwcHJvdmFsVG9waWMudG9waWNBcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ1NOUyBUb3BpYyBBUk4gZm9yIGFwcHJvdmFsIG5vdGlmaWNhdGlvbnMnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Nsb3VkRnJvbnREaXN0cmlidXRpb25JZCcsIHtcbiAgICAgIHZhbHVlOiBkaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uSWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0Nsb3VkRnJvbnQgRGlzdHJpYnV0aW9uIElEIChmb3IgbWFudWFsIGNhY2hlIGludmFsaWRhdGlvbiknLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0NhY2hlSW52YWxpZGF0aW9uQ29tbWFuZCcsIHtcbiAgICAgIHZhbHVlOiBgYXdzIGNsb3VkZnJvbnQgY3JlYXRlLWludmFsaWRhdGlvbiAtLWRpc3RyaWJ1dGlvbi1pZCAke2Rpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25JZH0gLS1wYXRocyBcIi8qXCJgLFxuICAgICAgZGVzY3JpcHRpb246ICdDb21tYW5kIHRvIG1hbnVhbGx5IGludmFsaWRhdGUgQ2xvdWRGcm9udCBjYWNoZScsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==