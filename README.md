# subtitle-translator

When creating Aplify app for the first time, Github connection might not work. In the console, reconfigure and connect again. Then re-build the frontend

https://www.youtube.com/watch?v=mSKQlV3lRYw

https://www.youtube.com/watch?v=tw9cQyA3B1M

## Create frontend programatically

```bash
cd frontend/
npx create-react-app my-project-name
```

## Create backend programatically

```bash
cdk init --language typescript
npm install @aws-cdk/aws-amplify @aws-cdk/aws-lambda @aws-cdk/aws-apigateway 
```

Build CDK components in backend/lib/backend-stack.ts.

Have all @aws-cdk components in the same version!
https://github.com/aws/aws-cdk/issues/3416
https://github.com/aws/aws-cdk/issues/14738


```bash
npm udate # to update nodejs dependencies?
npm run build # important! https://github.com/aws/aws-cdk/issues/2083
cdk synth
cdk deploy
```

Create amplify project in dir, creates project in cloud as well

```bash
amplify init
amplify add storage # adds storage (nosql, etc.) to the backend
amplify add api # graphql, rest
amplify push
```

## Create a file upload button

hot load of react https://stackoverflow.com/a/65171489/4569908
