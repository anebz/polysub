import os
import re
import srt
import json
import boto3
from datetime import datetime
import sagemaker
from sagemaker.predictor import Predictor
from sagemaker.serializers import JSONSerializer

s3 = boto3.client("s3")
runtime = boto3.client('runtime.sagemaker', region_name='eu-central-1')

# TODO improve sentence joining algorithm
def join_all_text(parsed_data: list):
    joined_text = ''
    prev_time = ''
    it = 0
    for id, vals in parsed_data.items():

        text = vals['text'].strip()

        if len(joined_text) > 0 and joined_text[-1] != '\n':
            joined_text += ' '
        
        '''
        # get current time, first time of this line
        current_time = re.findall(r'(\d\d:\d\d:\d\d)', vals['time'])[0]

        if prev_time == '':
            # take the last time of the sequence
            try:
                prev_time = re.findall(r'(\d\d:\d\d:\d\d)', vals['time'])[-1]
            except Exception:
                prev_time = current_time

        # check if a lot of time has passed since the last text. if so, this is a new sentence
        tdelta = (datetime.strptime(current_time, '%H:%M:%S') - datetime.strptime(prev_time, '%H:%M:%S')).total_seconds()
        if int(tdelta) > 10 and joined_text[-1] != '\n':
            joined_text += '\n' + text
            it += 1
        else:
            joined_text += text
        '''
        joined_text += text # TEMPORARY
        parsed_data[id]['map'] = it

        # check if text ends in punctuation. if so, it's the end of the sentence
        if text.rstrip('</i>')[-1] in ['.', '?', '!', ')']:
            joined_text += '\n'
            it += 1
        
        '''
        try:
            prev_time = re.findall(r'(\d\d:\d\d:\d\d)', vals['time'])[-1]
        except Exception:
            prev_time = current_time
        '''

    joined_text = joined_text.split('\n')
    if joined_text[-1] == '':
        joined_text = joined_text[:-1]
    return joined_text


def handler(event, context):

    if event["httpMethod"] == 'POST':
        req_body = event['body']
        file_name = re.search(r'filename="(.*)"', req_body)[1]
        file_contents = '\n'.join(req_body.split('\r\n')[4:-2])
        print('filename', file_name)
        print(file_contents.split('\n'))

        ## Translation step ##
        lang_origin = 'es'
        lang_target = 'en'
        endpoint_name = f'translation-{lang_origin}-{lang_target}'
        predictor = Predictor(endpoint_name=endpoint_name, sagemaker_session=sagemaker.Session(), serializer=JSONSerializer())
        
        ## Parse input content into subtitles format ##
        subs = list(srt.parse(file_contents))
        joined_text = [sub.content for sub in subs]
        print('text to translate', joined_text)

        ## invoke Sagemaker endpoint and obtain results ##
        response = runtime.invoke_endpoint(EndpointName=endpoint_name, ContentType='application/json', Body=json.dumps({'inputs': joined_text}))
        translated_text = [el['translation_text'] for el in json.loads(response['Body'].read().decode())]
        print('translated text', translated_text)

        for sub, translated in zip(subs, translated_text):
            sub.content = translated
        final_str = srt.compose(subs)
        print('final_string', final_str)

        # TODO maybe just upload info without saving and uploading file?
        with open(f"/tmp/{file_name}", 'w') as f:
            f.write(final_str)

        # TODO give the new file a better name
        s3.upload_file(f"/tmp/{file_name}", os.environ['S3_BUCKET_NAME'], file_name)

        # obtain pre-signed url
        presigned_url = s3.generate_presigned_url('get_object',Params={'Bucket': os.environ['S3_BUCKET_NAME'], 'Key': file_name}, ExpiresIn=300) # 5mins

        statusCode = 200
        result = f"file {file_name} uploaded. Download here: {presigned_url}"
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
