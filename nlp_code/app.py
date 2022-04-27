import io
import re
import streamlit as st
from datetime import datetime
from collections import OrderedDict
from transformers import pipeline

@st.cache(allow_output_mutation=True)
def load_model(lang_origin: str, lang_target: str):
    return pipeline("translation", model=f"Helsinki-NLP/opus-mt-{lang_origin}-{lang_target}")

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


if __name__ == "__main__":

    st.set_page_config(
        page_title="Translate your subtitles",
        page_icon="https://emojipedia-us.s3.dualstack.us-west-1.amazonaws.com/thumbs/120/twitter/322/television_1f4fa.png")
    st.title('Translate your subtitles 🌐')
    st.markdown('Upload your subtitle, file, choose a language and get your translated subtitles')
    st.write("Github repo: [![Star](https://img.shields.io/github/stars/anebz/subtitle-translator.svg?logo=github&style=social)](https://github.com/anebz/subtitle-translator)")

    supported_langs_origin = ['es']
    supported_langs_target = ['en']
    uploaded_file = st.file_uploader("Choose your subtitle file", type="srt")
    lang_origin = st.radio('Choose the language the subtitles are in', sorted(supported_langs_origin))
    lang_target = st.radio('Choose the language you want to translate the subtitles to', sorted(supported_langs_target))

    translator = load_model(lang_origin, lang_target)

    if uploaded_file is not None:
        if st.button('Translate subtitles'):
            st.text("Translating... For longer episodes or movies, this might take a few minutes. Please don't close the tab")
            # TODO encoding to latin-1 if spanish https://stackoverflow.com/a/65829401/4569908
            subtitle_text = io.TextIOWrapper(uploaded_file).read().split('\n')
            parsed_data = parse_input_data(subtitle_text)
            joined_text = join_all_text(parsed_data)
            translated_text = [translator(sentence)[0]['translation_text'] for sentence in joined_text]

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

            st.success('Translation ready!')
            st.download_button('Download translated subtitles', final_str, file_name=f'{uploaded_file.name}-{lang_target}.srt')

