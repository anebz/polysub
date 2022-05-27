import os
import re
import srt
import json
import time
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


def parse_request_body(body):
    try:
        #TODO handle different encodings
        req_body = base64.b64decode(body).decode('latin-1')
        file_name = re.search(r'filename="(.*)"', req_body)[1]
        lang_source, lang_target = re.findall(r'name="lang_source".*XX_(\w*)_XX?.*name="lang_target".*XX_(\w*)_XX', req_body, re.DOTALL)[0]
        file_contents = '\n'.join(req_body.split('\r\n')[12:-2])
    except Exception as e:
        print("ERROR: ", e)
        raise e

    # remove weird character
    file_contents = file_contents.replace('ï»¿', '')
    print('filename', file_name)
    print('lang_source', lang_source, 'lang_target', lang_target)

    ## Parse input content into subtitles format ##
    subs = list(srt.parse(file_contents))
    joined_text = [sub.content for sub in subs]
    print('num_subtitles', len(file_contents))
    return lang_source, lang_target, file_name, joined_text, subs


def get_hg_translations(lang_source, lang_target, joined_text):
    API_URL = f"https://api-inference.huggingface.co/models/Helsinki-NLP/opus-mt-{lang_source}-{lang_target}"
    headers = {
        "User-Agent" : "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36",
        "Authorization": f"Bearer {os.environ['HG_API_KEY']}"
    }

    translated_text = []
    for i in range(0, len(joined_text), 100):
        print(f"translating from {i} to {i+100}")
        payload = {
            "inputs": joined_text[i:min(i+100, len(joined_text)-1)],
            "options": {"wait_for_model": True}
        }

        # get response and retry if error
        j = 0
        while j < 5:
            try:
                ## invoke 🤗 HuggingFace endpoint and obtain results ##
                response = requests.post(API_URL, headers=headers, json=payload).json()
            except Exception as e:
                print("error with response", e)
                j += 1
                continue
            
            if len(response) == 0:
                print("Response is empty")
                translated_text.append('')
                break
            elif 'error' in response or 'translation_text' not in response[0]:
                print("ERROR", response)
                print(f"Waiting 10s and retrying {j+1}/5")
                j += 1
                time.sleep(10)
            else:
                print("Response is valid. Added translation to array")
                translated_text.extend(res['translation_text'] for res in response)
                break
        if j == 5:
            raise requests.exceptions.ConnectionErrgor
    print('translated text', translated_text)
    return translated_text


def upload_to_s3(file_name, lang_target, final_str):
    print("Uploading to S3")
    new_file_name = file_name.replace('.srt', f'-{lang_target}.srt')
    with open(f"/tmp/{new_file_name}", 'w') as f:
        f.write(final_str)
    s3.upload_file(f"/tmp/{new_file_name}", os.environ['S3_BUCKET_NAME'], new_file_name)
    presigned_url = s3.generate_presigned_url('get_object',Params={'Bucket': os.environ['S3_BUCKET_NAME'], 'Key': new_file_name}, ExpiresIn=300) # 5mins
    print("presigned URL:", presigned_url)
    return presigned_url


def add_analytics_to_ddb(lang_source, lang_target, len_joined_text):
    print("Adding analytics to DynamoDB")
    today = datetime.datetime.now().strftime('%Y-%m-%d')
    dbResponse = ddb.update_item(
        TableName=os.environ['DDB_TABLE_NAME'],
        Key={'date': {'S': today}},
        UpdateExpression="ADD #lang_source :increment, #lang_target :increment, #num_subs :add",
        ExpressionAttributeNames={'#lang_source': f'lang_source_{lang_source}', '#lang_target': f'lang_target_{lang_target}', '#num_subs': 'num_subs'},
        ExpressionAttributeValues={':increment': {'N': '1'}, ':add': {'N': str(len_joined_text)}}
    )
    return dbResponse['ResponseMetadata']['HTTPStatusCode']


def handler(event, context):

    try:
        assert event['requestContext']['http']['method'] == 'POST'
    except:
        print("ERROR: HTTP request is not POST")
        raise requests.exceptions.HTTPError

    lang_source, lang_target, file_name, joined_text, subs = parse_request_body(event['body'])

    ## Translation step ##
    translated_text = get_hg_translations(lang_source, lang_target, joined_text)

    ## parse back to subtitle format ##
    for sub, translated in zip(subs, translated_text):
        sub.content = translated
    final_str = srt.compose(subs)

    ## upload to s3 and obtain presigned url
    presigned_url = upload_to_s3(file_name, lang_target, final_str)

    ## Add analytics data to DynamoDB table ##
    dbStatus = add_analytics_to_ddb(lang_source, lang_target, len(joined_text))

    print("Finished translating")

    return { "statusCode": 200, "body": json.dumps({"result": presigned_url, "dbStatus": dbStatus}) }
