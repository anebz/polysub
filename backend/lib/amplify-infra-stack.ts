import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import * as iam from '@aws-cdk/aws-iam'
import * as sqs from '@aws-cdk/aws-sqs';
import * as lambda from "@aws-cdk/aws-lambda";
import * as amplify from '@aws-cdk/aws-amplify';
import * as apigw from "@aws-cdk/aws-apigateway";
import { PythonFunction } from "@aws-cdk/aws-lambda-python";
import { SqsEventSource } from '@aws-cdk/aws-lambda-event-sources';
import * as path from 'path';
import * as tasks from '@aws-cdk/aws-stepfunctions-tasks';
import * as sfn from '@aws-cdk/aws-stepfunctions'


const GITHUB_REPO = 'polysub'
const GITHUB_REPO_PATH = 'frontend'

export class AmplifyInfraStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 bucket
    const myBucket = new s3.Bucket(this, 'polysub-bucket', {
      bucketName: 'polysub-bucket',
      versioned: false,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [
        {
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(1),
          expiration: cdk.Duration.days(1)
        }
      ]
    });

    // SQS queue
    /*
    const deadLetterQueue = new sqs.Queue(this, 'deadLetterQueue', {
      retentionPeriod: cdk.Duration.minutes(30),
    });
    const messageQueue = new sqs.Queue(this, 'MyQueue', {
      visibilityTimeout: cdk.Duration.minutes(9),      // default,
      receiveMessageWaitTime: cdk.Duration.seconds(20), // defau
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: 1,
      },
    });
    */

    // Lambda Function
    const myLambda = new PythonFunction(this, 'PolySubLambda', {
      entry: 'lib/lambda',
      index: 'handler.py',
      handler: 'handler',
      timeout: cdk.Duration.minutes(9), // default duration is 3s
      runtime: lambda.Runtime.PYTHON_3_8, // optional, defaults to lambda.Runtime.PYTHON_3_7
      environment: {
        "S3_BUCKET_NAME": myBucket.bucketName,
        "HG_API_KEY": cdk.SecretValue.secretsManager('hg-api-token').toString()
      },
      //deadLetterQueueEnabled: true,
      //deadLetterQueue: deadLetterQueue
    });
    myBucket.grantRead(myLambda);
    myBucket.grantWrite(myLambda);

    /*
    myLambda.addEventSource(new SqsEventSource(messageQueue, {
      batchSize: 10,
      maxBatchingWindow: cdk.Duration.minutes(5),
      reportBatchItemFailures: true, // default to false
    }));
    */
    
    // API Gateway
    const myApiGW = new apigw.RestApi(this, 'polysub-api', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
        allowHeaders: ['*']
      }
    });

    myApiGW.root
      .resourceForPath("translate")
      .addMethod("POST", 
        new apigw.LambdaIntegration(myLambda));

    // invocation type Event should be for async
    const submitJob = new tasks.LambdaInvoke(this, 'Invoke Handler', {
      lambdaFunction: myLambda,
      payload: sfn.TaskInput.fromJsonPathAt('$.input'),
      invocationType: tasks.LambdaInvocationType.EVENT,
    });

    /*
    const credentialsRole = new iam.Role(this, "Role", {
      assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com"),
    });

    credentialsRole.attachInlinePolicy(
      new iam.Policy(this, "SendMessagePolicy", {
        statements: [
          new iam.PolicyStatement({
            actions: ["sqs:SendMessage"],
            effect: iam.Effect.ALLOW,
            resources: [messageQueue.queueArn],
          }),
        ],
      })
    );

    
    const apiQueue = myApiGW.root.addResource("queue");
    apiQueue.addMethod(
      "GET",
      new apigw.AwsIntegration({
        service: "sqs",
        path: `${cdk.Aws.ACCOUNT_ID}/${messageQueue.queueName}`,
        integrationHttpMethod: "POST",
        options: {
          credentialsRole,
          passthroughBehavior: apigw.PassthroughBehavior.NEVER,
          requestParameters: {"integration.request.header.Content-Type": `'application/x-www-form-urlencoded'`},
          requestTemplates: {"application/json": `Action=SendMessage&MessageBody=$util.urlEncode("$method.request.querystring.message")`},
          integrationResponses: [{ statusCode: "200", responseTemplates: {"application/json": `{"done": true}`}}],
        },
      }),
      { methodResponses: [{ statusCode: "200" }] }
    );
    */

    // Amplify app
    const amplifyApp = new amplify.App(this, "polysub-app", {
      sourceCodeProvider: new amplify.GitHubSourceCodeProvider({
        owner: "anebz",
        repository: GITHUB_REPO,
        oauthToken: cdk.SecretValue.secretsManager('github-token') // token stored in aws secrets manager
      }),
      environmentVariables: {
        'AMPLIFY_MONOREPO_APP_ROOT': GITHUB_REPO_PATH,
        'ENDPOINT': myApiGW.url,
        'REGION': this.region
      }
    });
    amplifyApp.addBranch("main");

    new cdk.CfnOutput(this, "HTTP API URL", {
      value: myApiGW.url ?? "Something went wrong with the deploy",
    });
  }
}
