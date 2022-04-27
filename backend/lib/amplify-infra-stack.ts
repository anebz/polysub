//import { Stack, StackProps } from 'aws-cdk-lib';
//import { Construct } from 'constructs';
import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam';
import * as amplify from '@aws-cdk/aws-amplify';
import * as lambda from "@aws-cdk/aws-lambda";
import * as apigw from "@aws-cdk/aws-apigateway";
import * as s3 from '@aws-cdk/aws-s3';
import * as path from 'path';

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

    const myLambda = new lambda.Function(this, 'PolySubLambda', {
      runtime: lambda.Runtime.PYTHON_3_7, //NODEJS_14_X
      handler: 'handler.lambda_handler', // handler.handler for nodejs
      code: lambda.Code.fromAsset(path.resolve(__dirname, 'lambda')),
      environment: {
        "S3_BUCKET_NAME": myBucket.bucketName
      }
    });
    myBucket.grantRead(myLambda);
    myBucket.grantWrite(myLambda);

    // API Gateway
    const myAPIGateway = new apigw.RestApi(this, 'polysub-api', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigw.Cors.ALL_ORIGINS,
        allowMethods: apigw.Cors.ALL_METHODS,
        allowHeaders: ['*']
      }
    });

    myAPIGateway.root
      .resourceForPath("translate")
      .addMethod("POST", new apigw.LambdaIntegration(myLambda));
    
    new cdk.CfnOutput(this, "HTTP API URL", {
      value: myAPIGateway.url ?? "Something went wrong with the deploy",
    });

    // Amplify app
    const amplifyApp = new amplify.App(this, "polysub-app", {
      sourceCodeProvider: new amplify.GitHubSourceCodeProvider({
        owner: "anebz",
        repository: GITHUB_REPO,
        oauthToken: cdk.SecretValue.secretsManager('github-token') // token stored in aws secrets manager
      }),
      environmentVariables: {
        'AMPLIFY_MONOREPO_APP_ROOT': GITHUB_REPO,
        'ENDPOINT': myAPIGateway.url,
        'REGION': this.region
      }
    });
    amplifyApp.addBranch("main");
  }
}
