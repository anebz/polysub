import os
import re
import srt
import json
import boto3
import base64
import datetime
import requests

s3 = boto3.client("s3")
ddb = boto3.client('dynamodb', region_name='eu-central-1')

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

    if event['requestContext']['http']['method'] == 'POST':
        #TODO handle different encodings
        req_body = base64.b64decode(event['body']).decode('latin-1')
        file_name = re.search(r'filename="(.*)"', req_body)[1]
        lang_source, lang_target = re.findall(r'name="lang_source".*XX_(\w*)_XX?.*name="lang_target".*XX_(\w*)_XX', req_body, re.DOTALL)[0]
        file_contents = '\n'.join(req_body.split('\r\n')[12:-2])
        print('filename', file_name)
        print('lang_source', lang_source, 'lang_target', lang_target)

        ## Parse input content into subtitles format ##
        subs = list(srt.parse(file_contents))
        joined_text = [sub.content for sub in subs]
        print('num_subtitles', len(file_contents))

        ## Translation step ##
        API_URL = f"https://api-inference.huggingface.co/models/Helsinki-NLP/opus-mt-{lang_source}-{lang_target}"        
        translated_text = []
        for i in range(0, len(joined_text), 100):
            print(f"translating from {i} to {i+100}")
            payload = {
                "inputs": joined_text[i:min(i+100, len(joined_text)-1)],
                "options": {"wait_for_model": True}
            }
            ## invoke 🤗 HuggingFace endpoint and obtain results ##
            headers = {
                "User-Agent" : "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36",
                "Authorization": f"Bearer {os.environ['HG_API_KEY']}"
            }
            response = requests.post(API_URL, headers=headers, json=payload).json()
            if len(response) == 0:
                translated_text.append('')
                continue
            elif 'error' in response or 'translation_text' not in response[0]:
                print("ERROR", response)
                return {
                    "statusCode": "500",
                    "body": json.dumps({"result": response}),
                }
            translated_text.extend(res['translation_text'] for res in response)
        print('translated text', translated_text)

        ## parse back to subtitle format ##
        for sub, translated in zip(subs, translated_text):
            sub.content = translated
        final_str = srt.compose(subs)

        ## upload to s3 and obtain presigned url
        print("Uploading to S3")
        new_file_name = file_name.replace('.srt', f'-{lang_target}.srt')
        with open(f"/tmp/{new_file_name}", 'w') as f:
            f.write(final_str)
        s3.upload_file(f"/tmp/{new_file_name}", os.environ['S3_BUCKET_NAME'], new_file_name)
        presigned_url = s3.generate_presigned_url('get_object',Params={'Bucket': os.environ['S3_BUCKET_NAME'], 'Key': new_file_name}, ExpiresIn=300) # 5mins
        print("presigned URL:", presigned_url)

        ## Add analytics data to DynamoDB table ##
        print("Adding analytics to DynamoDB")
        today = datetime.datetime.now().strftime('%Y-%m-%d')
        dbResponse = ddb.update_item(
            TableName=os.environ['DDB_TABLE_NAME'],
            Key={'date': {'S': today}},
            UpdateExpression="ADD #lang_source :increment, #lang_target :increment, #num_subs :add",
            ExpressionAttributeNames={'#lang_source': f'lang_source_{lang_source}', '#lang_target': f'lang_target_{lang_target}', '#num_subs': 'num_subs'},
            ExpressionAttributeValues={':increment': {'N': '1'}, ':add': {'N': str(len(joined_text))}}
        )
        dbStatus = dbResponse['ResponseMetadata']['HTTPStatusCode']
        print("Finished translating")

        statusCode = 200
        result = presigned_url
    else:
        statusCode = 500
        result = "error"
        dbStatus = 0

    return {
        "statusCode": statusCode,
        "body": json.dumps({"result": result, "dbStatus": dbStatus}),
    }
