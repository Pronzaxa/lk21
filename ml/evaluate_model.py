"""Small authored development set, not production accuracy or independent validation."""
import json,pathlib,collections
import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer
root=pathlib.Path(__file__).resolve().parents[1];assets=root/'public/models/nuresq-emergency-nlu'
tok=AutoTokenizer.from_pretrained(assets,local_files_only=True)
session=ort.InferenceSession(str(assets/'model.onnx'),providers=['CPUExecutionProvider'])
prototypes=json.loads((assets/'prototypes.json').read_text());labels=[x['id'] for x in prototypes];matrix=np.array([x['vector'] for x in prototypes])
cases=json.loads((root/'ml/evaluation.json').read_text());results=[];confusion={label:{other:0 for other in labels} for label in labels}
for case in cases:
 inputs=tok(case['text'],return_tensors='np',truncation=True,max_length=96)
 vector=session.run(None,{i.name:inputs[i.name] for i in session.get_inputs()})[0][0];vector/=max(np.linalg.norm(vector),1e-8)
 scores=matrix@vector;predicted=labels[int(scores.argmax())];confusion[case['incident_type']][predicted]+=1
 results.append({**case,'predicted':predicted,'cosine_score':float(scores.max())})
metrics={}
for label in labels:
 tp=confusion[label][label];actual=sum(confusion[label].values());pred=sum(confusion[x][label] for x in labels)
 metrics[label]={'precision':tp/pred if pred else None,'recall':tp/actual if actual else None}
report={'scope':'12 authored synthetic development examples; NOT production accuracy; prototype scores are not probabilities','accuracy':sum(x['predicted']==x['incident_type'] for x in results)/len(results),'per_class':metrics,'confusion_matrix':confusion,'results':results}
(root/'ml/EVALUATION_REPORT.json').write_text(json.dumps(report,indent=2,ensure_ascii=False),encoding='utf8');print(json.dumps({'accuracy':report['accuracy'],'count':len(results)}))
