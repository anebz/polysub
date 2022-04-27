from collections import OrderedDict

fname = 'C:/Users/anebe/Desktop/The Rescue (2021)/The.Rescue.2021.srt'

def process_lines(subdata: OrderedDict, chunk: list) -> OrderedDict:
    pass

subdata = OrderedDict()
with open(fname) as f:
    chunk = []
    lines = f.read().splitlines()


for line in lines:
    if line == '':
        if len(chunk) > 0:
            process_lines(subdata, chunk)
            print(chunk)
        chunk = []
    if line.isnumeric() or len(chunk) != 0:
        chunk.append(line)
if len(chunk) > 0:
    process_lines(subdata, chunk)
