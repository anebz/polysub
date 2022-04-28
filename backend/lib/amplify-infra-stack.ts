//import { Stack, StackProps } from 'aws-cdk-lib';
//import { Construct } from 'constructs';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as amplify from '@aws-cdk/aws-amplify';
import * as lambda from "@aws-cdk/aws-lambda";
import * as apigw from "@aws-cdk/aws-apigateway";
import * as s3 from '@aws-cdk/aws-s3';
import * as path from 'path';
import { PythonFunction } from "@aws-cdk/aws-lambda-python";

const GITHUB_REPO = 'subtitle-translator'
const GITHUB_REPO_PATH = 'frontend'

export class AmplifyInfraStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 bucket and Lambda function
    const myBucket = new s3.Bucket(this, 'polysub-bucket', {
      versioned: false,
      bucketName: 'polysub-bucket',
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL
    });

    /*
    const myLambda = new lambda.Function(this, 'PolySubLambda', {
      runtime: lambda.Runtime.PYTHON_3_7,
      handler: 'handler.lambda_handler',
      code: lambda.Code.fromAsset(path.resolve(__dirname, 'lambda')),
      environment: {
        "S3_BUCKET_NAME": myBucket.bucketName
      }
    });
    */

    const myLambda = new PythonFunction(this, 'PolySubLambda', {
      entry: 'lib/lambda', // required
      index: 'handler.py', // optional, defaults to 'index.py'
      handler: 'lambda_handler', // optional, defaults to 'handler'
      runtime: lambda.Runtime.PYTHON_3_8, // optional, defaults to lambda.Runtime.PYTHON_3_7
      environment: {
        "S3_BUCKET_NAME": myBucket.bucketName
      }
    });

    // TODO delete all dummy once it's implemented
    const myLambdaDummy = new lambda.Function(this, 'DummyLambda', {
      runtime: lambda.Runtime.PYTHON_3_7,
      handler: 'handler_dummy.lambda_handler',
      code: lambda.Code.fromAsset(path.resolve(__dirname, 'lambda')),
      environment: {
        "S3_BUCKET_NAME": myBucket.bucketName
      }
    });
    myBucket.grantRead(myLambda);
    myBucket.grantWrite(myLambda);
    myBucket.grantRead(myLambdaDummy);
    myBucket.grantWrite(myLambdaDummy);

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
      .addMethod("POST", new apigw.LambdaIntegration(myLambda));
    
    new cdk.CfnOutput(this, "HTTP API URL", {
      value: myApiGW.url ?? "Something went wrong with the deploy",
    });

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
  }
}
