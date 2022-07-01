import { Construct } from 'constructs';
import * as fs from "fs";
import * as path from "path";
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from "aws-cdk-lib/aws-iam";
import * as sns from 'aws-cdk-lib/aws-sns';
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';

import * as amplify from '@aws-cdk/aws-amplify-alpha';
import { PythonFunction } from "@aws-cdk/aws-lambda-python-alpha";

const GITHUB_TOKEN = fs.readFileSync(path.join(__dirname, "/../github_oauth_token.txt"), "utf8");

export class PolySubStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Amplify app
    const amplifyApp = new amplify.App(this, "polysub-app", {
      sourceCodeProvider: new amplify.GitHubSourceCodeProvider({
        owner: "anebz",
        repository: "polysub",
        oauthToken: cdk.SecretValue.unsafePlainText(GITHUB_TOKEN)
      }),
      environmentVariables: {
        'AMPLIFY_MONOREPO_APP_ROOT': "frontend",
        'ENDPOINT': 'CHANGE_TO_LAMBDA_FUNCTION_URL', // ⚠️ CHANGE AFTER DEPLOYMENT
        'REGION': this.region
      }
    });
    amplifyApp.addBranch("main");

    // S3 bucket
    const myBucket = new s3.Bucket(this, 'polysub-bucket', {
      versioned: false,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [{
        abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
        expiration: cdk.Duration.days(1)
      }]
    });

    // DynamoDB table
    const dDBTable = new dynamodb.Table(this, 'PolySubDDB', {
      readCapacity: 1,
      writeCapacity: 1,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: dynamodb.BillingMode.PROVISIONED,
      partitionKey: { name: 'date', type: dynamodb.AttributeType.STRING },
      pointInTimeRecovery: true,
    });

    // Lambda Function
    const myLambda = new PythonFunction(this, 'PolySubLambda', {
      entry: 'lib/lambda',
      index: 'handler.py',
      handler: 'handler',
      timeout: cdk.Duration.minutes(9),
      runtime: lambda.Runtime.PYTHON_3_8,
      environment: {
        "S3_BUCKET_NAME": myBucket.bucketName,
        'DDB_TABLE_NAME': dDBTable.tableName
      },
    });
    myBucket.grantWrite(myLambda);
    dDBTable.grantWriteData(myLambda);

    // Add Lambda role to access secrets
    myLambda.role?.attachInlinePolicy(
      new iam.Policy(this, 'get-ane-secrets-policy', {
        statements: [new iam.PolicyStatement({
          actions: ['s3:GetObject'],
          resources: ['arn:aws:s3:::ane-secrets/*'],
        })],
      }),
    );

    // Alarm that gets triggered with code errors and timeouts
    // https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics.html
    const myAlarm = new cloudwatch.Alarm(this, 'lambda-errors-alarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Errors',
        period: cdk.Duration.minutes(1),
        statistic: 'Sum',
        dimensionsMap: { FunctionName: myLambda.functionName },
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      alarmDescription: 'Alarm if the SUM of Errors is greater than or equal to the threshold (1) for 1 evaluation period',
    });

    // SNS topic
    const topic = new sns.Topic(this, 'polysub-sns-topic');
    // CloudWatch Alarm will trigger SNS topic
    myAlarm.addAlarmAction(new actions.SnsAction(topic));
    // SNS topic will trigger email
    topic.addSubscription(new subs.EmailSubscription("anebzt@protonmail.com"));

  }
}
