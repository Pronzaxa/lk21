import * as ort from 'onnxruntime-web/wasm';
type Prototype = {id: string; vector: number[]};
let session: ort.InferenceSession | null = null;
let vocab: Record<string,number> = {};
let prototypes: Prototype[]=[];
let guideVectors: Prototype[]=[];
let maxLength=96;
let serial=Promise.resolve();

function tokenize(text: string) {
  const words=text.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().match(/[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu)??[];
  const ids=[vocab['[CLS]']];
  for(const word of words) {
    let start=0;const pieces:number[]=[];
    while(start<word.length) {
      let end=word.length;let found:number|undefined;
      while(end>start) {const piece=(start?'##':'')+word.slice(start,end);if(vocab[piece]!==undefined){found=vocab[piece];break;}end--;}
      if(found===undefined){pieces.splice(0,pieces.length,vocab['[UNK]']);break;}
      pieces.push(found);start=end;
    }
    ids.push(...pieces);if(ids.length>=maxLength-1)break;
  }
  return [...ids.slice(0,maxLength-1),vocab['[SEP]']];
}
async function embed(text: string) {
  if(!session)throw new Error('UNAVAILABLE');
  const ids=tokenize(text);
  const values:Record<string,number[]>={input_ids:ids,attention_mask:ids.map(()=>1),token_type_ids:ids.map(()=>0)};
  const feeds:Record<string,ort.Tensor>={};
  for(const name of session.inputNames) { if(!values[name])throw new Error('UNSUPPORTED_MODEL_INPUT');feeds[name]=new ort.Tensor('int64',BigInt64Array.from(values[name],BigInt),[1,ids.length]); }
  const result=await session.run(feeds);
  const output=result.embedding;
  if(!output||output.dims.length!==2)throw new Error('UNSUPPORTED_MODEL_OUTPUT');
  const vector=Array.from(output.data as Float32Array);const norm=Math.hypot(...vector)||1;
  return vector.map(x=>x/norm);
}
const match = (vector:number[],items:Prototype[]) => items.map(item=>({id:item.id,confidence:Math.max(0,Math.min(1,item.vector.reduce((sum,x,i)=>sum+x*(vector[i]??0),0)))})).sort((a,b)=>b.confidence-a.confidence);
async function initialize({base,version,wasmBase}:{base:string;version:string;wasmBase:string}) {
  if(session)return;
  const cache=typeof caches!=='undefined'?await caches.open(`nuresq-local-ai-${version}`):null;
  const asset=async(name:string)=>{
    const url=new URL(name,base).href;
    const cached=await cache?.match(url);if(cached)return cached;
    const response=await fetch(url,{cache:'no-cache'});
    if(response.status===404)throw new Error('MODEL_NOT_INSTALLED');
    if(!response.ok)throw new Error('MODEL_FETCH_FAILED');
    if(cache)await cache.put(url,response.clone());
    return response;
  };
  const config=await (await asset('model-config.json')).json();
  if(!config.installed)throw new Error('MODEL_NOT_INSTALLED');
  if(config.version!==version||config.tokenizer!=='wordpiece'||config.output!=='embedding')throw new Error('MODEL_CONTRACT_MISMATCH');
  const tokenizer=await (await asset('tokenizer.json')).json();
  vocab=tokenizer.model.vocab;maxLength=config.maxLength??96;
  if(['[CLS]','[SEP]','[UNK]'].some(token=>!Number.isInteger(vocab[token])))throw new Error('TOKENIZER_INVALID');
  prototypes=await (await asset('prototypes.json')).json();guideVectors=await (await asset('guide-embeddings.json')).json();
  const model=await (await asset('model.onnx')).arrayBuffer();
  if(model.byteLength>50*1024*1024)throw new Error('MODEL_TOO_LARGE');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',model))).map(n=>n.toString(16).padStart(2,'0')).join('');
  if(digest!==config.sha256) {await cache?.delete(new URL('model.onnx',base).href);throw new Error('MODEL_CHECKSUM_FAILED');}
  ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths=wasmBase;
  session=await ort.InferenceSession.create(model,{executionProviders:['wasm']});
  await embed('uji kesiapan');
}
self.onmessage=({data})=>{
  serial=serial.then(async()=>{
    try {
      let result:unknown;
      if(data.kind==='initialize') {await initialize(data.payload);result=true;}
      else {const vector=await embed(data.payload);const labels=match(vector,prototypes);result=data.kind==='embed'?vector:{classification:{label:labels[0]?.id??'OTHER',confidence:labels[0]?.confidence??0,source:'LOCAL_AI'},guides:match(vector,guideVectors).slice(0,3)};}
      self.postMessage({id:data.id,result});
    } catch(error) {self.postMessage({id:data.id,error:error instanceof Error?error.message:'FAILED'});}
  });
};
