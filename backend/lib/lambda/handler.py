import os
import re
import json
import boto3
from datetime import datetime
from collections import OrderedDict
#from transformers import AutoConfig, pipeline
import sagemaker
from sagemaker.predictor import Predictor
from sagemaker.serializers import JSONSerializer

s3 = boto3.client("s3")
subdata = OrderedDict()

#def load_model(lang_origin: str, lang_target: str):
#    pretrained_checkpoint = f"Helsinki-NLP/opus-mt-{lang_origin}-{lang_target}"
#    # download config and save to file
#    config = AutoConfig.from_pretrained(pretrained_checkpoint)
#    config.to_json_file('config.json')
#    return pipeline("translation", model=pretrained_checkpoint)

def parse_input_data(text: list) -> OrderedDict:
    parsed_data = OrderedDict()
    chunk = []

    for line in text:
        if line == '':
            if len(chunk) > 0:
                parsed_data[int(chunk[0])] = {
                    'time': chunk[1],
                    'text': ' '.join(chunk[2:])
                }
            chunk = []
        if line.isnumeric() or len(chunk) != 0:
            chunk.append(line)
    if len(chunk) > 0:
        parsed_data[int(chunk[0])] = {
            'time': chunk[1],
            'text': ' '.join(chunk[2:])
        }
    return parsed_data


def join_all_text(parsed_data: OrderedDict):
    joined_text = ''
    prev_time = ''
    it = 0
    for id, vals in parsed_data.items():

        text = vals['text'].strip()

        if len(joined_text) > 0 and joined_text[-1] != '\n':
            joined_text += ' '

        if prev_time == '':
            # take the last time of the sequence
            prev_time = re.findall(r'(\d\d:\d\d:\d\d)', vals['time'])[-1]

        # check if a lot of time has passed since the last text. if so, this is a new sentence
        # get current time, first time of this line
        current_time = re.findall(r'(\d\d:\d\d:\d\d)', vals['time'])[0]
        tdelta = (datetime.strptime(current_time, '%H:%M:%S') - datetime.strptime(prev_time, '%H:%M:%S')).total_seconds()
        if int(tdelta) > 10 and joined_text[-1] != '\n':
            joined_text += '\n' + text
            it += 1
        else:
            joined_text += text
        parsed_data[id]['map'] = it

        # check if text ends in punctuation. if so, it's the end of the sentence
        if text.rstrip('</i>')[-1] in ['.', '?', '!', ')']:
            joined_text += '\n'
            it += 1
        
        prev_time = re.findall(r'(\d\d:\d\d:\d\d)', vals['time'])[-1]

    joined_text = joined_text.split('\n')
    if joined_text[-1] == '':
        joined_text = joined_text[:-1]
    return joined_text



def handler(event, context):

    if event["httpMethod"] == 'POST':
        req_body = event['body']
        file_name = re.search(r'filename="(.*)"', req_body)[1]
        file_contents = '\n'.join(req_body.split('\r\n')[4:-2])

        ## Translation step ##
        lang_origin = 'es'
        lang_target = 'en'
        #translator = load_model(lang_origin, lang_target)
        endpoint_name = 'translation-es-en'
        predictor = Predictor(endpoint_name=endpoint_name, sagemaker_session=sagemaker.Session(), serializer=JSONSerializer())
        parsed_data = parse_input_data(file_contents)
        joined_text = join_all_text(parsed_data)
        #translated_text = [translator(sentence)[0]['translation_text'] for sentence in joined_text]

        translated_text = []
        for sentence in joined_text[:20]:
            translated_text.append(json.loads(predictor.predict({ 'inputs': sentence }).decode('utf-8'))[0]['translation_text'])

        '''
        PART 4: replace translated text in the sub file
        dummy mode: replace all excerpts of a "sentence" by the whole translated sentence
        since we have no alignments
        '''
        transdata = OrderedDict()
        for key, vals in parsed_data.items():
            transdata[key] = {
                'time': vals['time'],
                'text': translated_text[vals['map']]
            }

        '''
        PART 5: write translated data into .srt
        '''
        final_str = ''
        for key, vals in transdata.items():
            final_str += str(key) + '\n'
            final_str += vals['time'] + '\n'
            final_str += vals['text'] + '\n'
            final_str += '\n'

        # TODO maybe just upload info without saving and uploading file?
        with open(f"/tmp/{file_name}", 'w') as f:
            f.write(final_str)

        # TODO give the new file a better name
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
