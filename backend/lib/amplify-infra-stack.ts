import * as cdk from '@aws-cdk/core';
import * as s3 from '@aws-cdk/aws-s3';
import * as lambda from "@aws-cdk/aws-lambda";
import * as amplify from '@aws-cdk/aws-amplify';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import { PythonFunction } from "@aws-cdk/aws-lambda-python";

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

    // DynamoDB table
    const dDBTable = new dynamodb.Table(this, 'PolySubDDB', {
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
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
        "HG_API_KEY": cdk.SecretValue.secretsManager('hg-api-token').toString(),
        'DDB_TABLE_NAME': dDBTable.tableName
      },
    });
    myBucket.grantRead(myLambda);
    myBucket.grantWrite(myLambda);
    dDBTable.grantWriteData(myLambda);

    // Amplify app
    const amplifyApp = new amplify.App(this, "polysub-app", {
      sourceCodeProvider: new amplify.GitHubSourceCodeProvider({
        owner: "anebz",
        repository: GITHUB_REPO,
        oauthToken: cdk.SecretValue.secretsManager('github-token') // token stored in aws secrets manager
      }),
      environmentVariables: {
        'AMPLIFY_MONOREPO_APP_ROOT': GITHUB_REPO_PATH,
        'ENDPOINT': 'CHANGE_TO_LAMBDA_FUNCTION_URL', // ⚠️ CHANGE AFTER DEPLOYMENT
        'REGION': this.region
      }
    });
    amplifyApp.addBranch("main");
  }
}
