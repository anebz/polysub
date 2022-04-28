import os
import re
import json
import boto3
s3 = boto3.client("s3")

def lambda_handler(event, context):

    if event["httpMethod"] == 'POST':
        req_body = event['body']
        file_name = re.search(r'filename="(.*)"', req_body)[1]
        file_contents = '\n'.join(req_body.split('\r\n')[4:-2])

        with open(f"/tmp/{file_name}", 'w') as f:
            f.write(file_contents)

        s3.upload_file(f"/tmp/{file_name}", os.environ['S3_BUCKET_NAME'], file_name)

        statusCode = 200
        result = f"file {file_name} uploaded"
    else:
        statusCode = 500
        result = "error"

    return {
        "statusCode": statusCode,
        "headers": {
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps({"result": result}),
    }
