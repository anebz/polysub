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

Build CDK components in backend/lib/backend-stack.ts

```bash
npm run build
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

#TODO NEXT STEPS

to upload files to S3 and lambda, api

https://www.youtube.com/watch?v=IgAE-ycnb94 done
foobar: https://www.youtube.com/watch?v=cJUtkerwIQM
send email from lambda https://www.youtube.com/watch?v=I_7g3t08BEE
    https://stackoverflow.com/questions/42627341/send-notification-alert-when-aws-lambda-function-has-an-error
    https://aws.amazon.com/blogs/mt/get-notified-specific-lambda-function-error-patterns-using-cloudwatch/

