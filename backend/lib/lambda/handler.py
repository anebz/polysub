import os
import re
import srt
import json
import boto3
import requests

s3 = boto3.client("s3")

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
        print(event) #TODO checking in which format the languages are coming
        file_name = re.search(r'filename="(.*)"', req_body)[1]
        file_contents = '\n'.join(req_body.split('\r\n')[4:-2])
        print('filename', file_name)

        ## Parse input content into subtitles format ##
        subs = list(srt.parse(file_contents))
        joined_text = [sub.content for sub in subs]

        ## Translation step ##
        # TODO get these infos from the event body
        lang_origin = 'es'
        lang_target = 'en'
        API_URL = f"https://api-inference.huggingface.co/models/Helsinki-NLP/opus-mt-{lang_origin}-{lang_target}"        
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
            elif 'error' in response[-1] or 'translation_text' not in response[-1]:
                return {
                    "statusCode": statusCode,
                    "headers": {
                        "Access-Control-Allow-Origin": "*",
                    },
                    "body": json.dumps({"result": response}),
                }
            translated_text.extend(res['translation_text'] for res in response)
        print('translated text', translated_text)

        ## parse back to subtitle format ##
        for sub, translated in zip(subs, translated_text):
            sub.content = translated
        final_str = srt.compose(subs)

        ## upload to s3 and obtain presigned url
        new_file_name = file_name.replace('.srt', f'-{lang_target}.srt')
        with open(f"/tmp/{new_file_name}", 'w') as f:
            f.write(final_str)
        s3.upload_file(f"/tmp/{new_file_name}", os.environ['S3_BUCKET_NAME'], new_file_name)
        presigned_url = s3.generate_presigned_url('get_object',Params={'Bucket': os.environ['S3_BUCKET_NAME'], 'Key': new_file_name}, ExpiresIn=300) # 5mins

        statusCode = 200
        result = presigned_url
    else:
        statusCode = 500
        result = "error"

    return {
        "statusCode": statusCode,
        "headers": {
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
        },
        "body": json.dumps({"result": result}),
    }
