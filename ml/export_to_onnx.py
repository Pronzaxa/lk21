"""Export a genuine IndoBERT-Lite encoder; prototype matching is experimental, not trained classification."""
import json, hashlib, pathlib, argparse
import numpy as np
import torch
from transformers import BertTokenizerFast, AutoModel
from onnxruntime.quantization import quantize_dynamic, QuantType
import onnxruntime as ort

ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'public/models/nuresq-emergency-nlu'
LABEL_TEXTS={
 'FLOOD':'Banjir, air meluap masuk rumah, ketinggian air meningkat, terendam air.',
 'EARTHQUAKE':'Gempa bumi mengguncang rumah, lantai bergetar, bangunan bergoyang.',
 'FIRE':'Kebakaran rumah, api membesar, asap tebal memenuhi ruangan.',
 'LANDSLIDE':'Tanah longsor menutup jalan, lereng runtuh dan tanah bergerak.',
 'MEDICAL':'Darurat medis, ibu sesak napas, korban pingsan dan tidak sadar.',
 'TRAPPED':'Saya terjebak tidak bisa keluar, pintu terkunci, tertimbun bangunan.',
 'EVACUATION_REQUEST':'Tolong evakuasi kami, saya membutuhkan pertolongan untuk keluar.',
 'GENERAL_GUIDANCE':'Saya hanya bertanya tentang panduan keselamatan, tidak ada keadaan darurat.',
 'OTHER':'Halo selamat pagi, terima kasih, saya ingin informasi umum.'}

class Encoder(torch.nn.Module):
 def __init__(self,model):
  super().__init__();self.model=model
 def forward(self,input_ids,attention_mask,token_type_ids):
  hidden=self.model(input_ids=input_ids,attention_mask=attention_mask,token_type_ids=token_type_ids).last_hidden_state
  mask=attention_mask.unsqueeze(-1).to(hidden.dtype)
  return (hidden*mask).sum(1)/mask.sum(1).clamp(min=1)

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--model',default='indobenchmark/indobert-lite-base-p1');parser.add_argument('--revision',default='main');args=parser.parse_args()
 OUT.mkdir(parents=True,exist_ok=True)
 tok=BertTokenizerFast.from_pretrained(args.model,revision=args.revision,trust_remote_code=False)
 model=AutoModel.from_pretrained(args.model,revision=args.revision,trust_remote_code=False,attn_implementation='eager').eval()
 encoder=Encoder(model).eval()
 sample=tok('Banjir masuk rumah',return_tensors='pt')
 fp=ROOT/'ml/encoder-fp32.onnx'
 torch.onnx.export(encoder,(sample['input_ids'],sample['attention_mask'],sample.get('token_type_ids',torch.zeros_like(sample['input_ids']))),str(fp),input_names=['input_ids','attention_mask','token_type_ids'],output_names=['embedding'],dynamic_axes={k:{0:'batch',1:'sequence'} for k in ['input_ids','attention_mask','token_type_ids']},opset_version=17,dynamo=False)
 quantize_dynamic(str(fp),str(OUT/'model.onnx'),weight_type=QuantType.QInt8)
 if (OUT/'model.onnx').stat().st_size>50*1024*1024:raise RuntimeError('Quantized model exceeds citizen size limit')
 tok.save_pretrained(OUT)
 tokenizer=json.loads((OUT/'tokenizer.json').read_text(encoding='utf8'))
 if tokenizer['model']['type']!='WordPiece':raise RuntimeError('Browser tokenizer contract mismatch')
 session=ort.InferenceSession(str(OUT/'model.onnx'),providers=['CPUExecutionProvider'])
 def embed(text):
  inputs=tok(text,return_tensors='np',truncation=True,max_length=96)
  vector=session.run(None,{v.name:inputs[v.name] for v in session.get_inputs()})[0][0]
  return (vector/max(np.linalg.norm(vector),1e-8)).tolist()
 (OUT/'prototypes.json').write_text(json.dumps([{'id':label,'vector':embed(text)} for label,text in LABEL_TEXTS.items()]),encoding='utf8')
 guides=json.loads((ROOT/'public/emergency-guides/index.json').read_text(encoding='utf8'))
 (OUT/'guide-embeddings.json').write_text(json.dumps([{'id':g['id'],'vector':embed(g['title']+'. '+g['text'])} for g in guides]),encoding='utf8')
 (OUT/'labels.json').write_text(json.dumps(list(LABEL_TEXTS)),encoding='utf8')
 (OUT/'model-config.json').write_text(json.dumps({'name':'IndoBERT-Lite prototype NLU','version':'v1','installed':True,'runtime':'onnx','quantization':'int8','language':'id','tokenizer':'wordpiece','output':'embedding','maxLength':96,'sha256':hashlib.sha256((OUT/'model.onnx').read_bytes()).hexdigest(),'source':args.model,'revision':getattr(model.config,'_commit_hash',args.revision),'license':'MIT','classification':'cosine prototypes; synthetic labels; not calibrated; no emergency fine-tuning','tasks':['incident_classification','semantic_embedding']},indent=2),encoding='utf8')
 print(json.dumps({'model_bytes':(OUT/'model.onnx').stat().st_size,'source':args.model}))
if __name__=='__main__':main()
