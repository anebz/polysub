import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import * as iam from "@aws-cdk/aws-iam";
import * as sns from '@aws-cdk/aws-sns';
import * as lambda from "@aws-cdk/aws-lambda";
import * as amplify from '@aws-cdk/aws-amplify';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import * as cloudwatch from '@aws-cdk/aws-cloudwatch';
import * as subs from '@aws-cdk/aws-sns-subscriptions';
import * as actions from '@aws-cdk/aws-cloudwatch-actions';
import { PythonFunction } from "@aws-cdk/aws-lambda-python";

const GITHUB_REPO = 'polysub'
const GITHUB_REPO_PATH = 'frontend'

export class AmplifyInfraStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Amplify app
    const amplifyApp = new amplify.App(this, "polysub-app", {
      sourceCodeProvider: new amplify.GitHubSourceCodeProvider({
        owner: "anebz",
        repository: GITHUB_REPO,
        oauthToken: cdk.SecretValue.secretsManager('github-token')
      }),
      environmentVariables: {
        'AMPLIFY_MONOREPO_APP_ROOT': GITHUB_REPO_PATH,
        'ENDPOINT': 'CHANGE_TO_LAMBDA_FUNCTION_URL', // ⚠️ CHANGE AFTER DEPLOYMENT
        'REGION': this.region
      }
    });
    amplifyApp.addBranch("main");

    // S3 bucket
    const myBucket = new s3.Bucket(this, 'polysub-bucket', {
      bucketName: 'polysub-bucket',
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
    myBucket.grantRead(myLambda);
    myBucket.grantWrite(myLambda);
    dDBTable.grantWriteData(myLambda);

    const s3GetSecrets = new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: ['arn:aws:s3:::ane-secrets/*'],
    });

    // 👇 add the policy to the Function's role
    myLambda.role?.attachInlinePolicy(
      new iam.Policy(this, 'get-ane-secrets-policy', {
        statements: [s3GetSecrets],
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
