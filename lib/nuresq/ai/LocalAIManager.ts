import WorkerFactory from './local-ai.worker?worker&inline';
import { getConfig } from '../../../config/nuresq.config';
import type { LocalAIState, LocalEmergencyAI, LocalAIAnalysis, ClassificationResult, GuideMatch } from './types';

export class LocalAIManager implements LocalEmergencyAI {
  private readonly useWorker: boolean;
  private readonly createWorker:()=>Worker;
  constructor(createWorker?:()=>Worker){ this.useWorker=Boolean(createWorker); this.createWorker=createWorker??(()=>new WorkerFactory()); }
  private state: LocalAIState = 'MODEL_NOT_INSTALLED';
  private worker: Worker | null = null;
  private initialization: Promise<void> | null = null;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private serial = 0;
  private listeners = new Set<() => void>();
  getState = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private setState(state: LocalAIState) { this.state=state; this.listeners.forEach(fn=>fn()); }
  dispose(state: LocalAIState = 'UNAVAILABLE') {
    this.worker?.terminate(); this.worker=null;
    for(const job of this.pending.values()) { clearTimeout(job.timer); job.reject(new Error(state)); }
    this.pending.clear(); this.initialization=null; this.setState(state);
  }
  private request(kind: string, payload: unknown, timeout: number): Promise<unknown> {
    if(!this.worker) return Promise.reject(new Error('UNAVAILABLE'));
    const id=++this.serial;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>this.dispose('FAILED'),timeout);
      this.pending.set(id,{resolve,reject,timer}); this.worker!.postMessage({id,kind,payload});
    });
  }
  initialize(): Promise<void> {
    if(this.state==='READY') return Promise.resolve();
    if(this.initialization) return this.initialization;
    if(!getConfig().localAI.enabled) {this.setState('RULE_FALLBACK');return Promise.resolve();}
    if(!this.useWorker && getConfig().localAI.runtime==='GGUF_SERVER') return this.initializeGguf();
    if(typeof Worker==='undefined'||typeof document==='undefined'||location.protocol==='file:') {this.setState('UNAVAILABLE');return Promise.resolve();}
    this.setState('LOADING');
    try {
      this.worker=this.createWorker();
      this.worker.onmessage=({data})=>{
        const job=this.pending.get(data.id); if(!job)return;
        clearTimeout(job.timer);this.pending.delete(data.id);
        if(data.error) job.reject(new Error(data.error)); else job.resolve(data.result);
      };
      this.worker.onerror=()=>this.dispose('FAILED');
      const config=getConfig();
      this.initialization=this.request('initialize',{base:new URL(config.localAI.modelPath,document.baseURI).href,version:config.localAI.version,wasmBase:new URL('./onnx/',document.baseURI).href},config.localAI.loadTimeoutMs)
        .then(()=>{if(this.worker)this.setState('READY');})
        .catch(error=>{this.dispose(error.message==='MODEL_NOT_INSTALLED'?'MODEL_NOT_INSTALLED':'FAILED');});
    } catch { this.dispose('FAILED');return Promise.resolve(); }
    return this.initialization;
  }
  private initializeGguf(): Promise<void> {
    if(this.initialization)return this.initialization;
    this.setState('LOADING');
    const config=getConfig().localAI;
    this.initialization=fetch(`${config.serverUrl}/health`,{signal:AbortSignal.timeout(config.loadTimeoutMs),cache:'no-store'})
      .then(async response=>{if(!response.ok)throw new Error('GGUF_SERVER_UNAVAILABLE');const body=await response.json();if(body.runtime!=='llama-cpp-python'||body.model!=='SmolLM2-135M-Instruct-Q3_K_M.gguf')throw new Error('GGUF_MODEL_MISMATCH');this.setState('READY');})
      .catch(()=>{this.setState('MODEL_NOT_INSTALLED');});
    return this.initialization;
  }
  async embed(text: string): Promise<number[]> {
    if(this.state!=='READY') throw new Error('RULE_FALLBACK');
    return await this.request('embed',text.slice(0,2000),getConfig().localAI.inferenceTimeoutMs) as number[];
  }
  async analyze(text: string): Promise<LocalAIAnalysis> {
    if(this.state!=='READY') return {state:this.state,classification:{label:'OTHER',confidence:0,source:'RULE_PARSER'},guides:[]};
    if(!this.useWorker && getConfig().localAI.runtime==='GGUF_SERVER') {
      try { const config=getConfig().localAI; const response=await fetch(`${config.serverUrl}/analyze`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:text.slice(0,2000)}),signal:AbortSignal.timeout(config.inferenceTimeoutMs),cache:'no-store'}); if(!response.ok)throw new Error('GGUF_INFERENCE_FAILED'); const result=await response.json(); return {...result,state:this.state}; } catch { return {state:this.state,classification:{label:'OTHER',confidence:0,source:'RULE_PARSER'},guides:[]}; }
    }
    try { const result=await this.request('analyze',text.slice(0,2000),getConfig().localAI.inferenceTimeoutMs) as Omit<LocalAIAnalysis,'state'>; return {...result,state:this.state}; }
    catch { return {state:this.state,classification:{label:'OTHER',confidence:0,source:'RULE_PARSER'},guides:[]}; }
  }
  async classifyIncident(text: string): Promise<ClassificationResult> { return (await this.analyze(text)).classification; }
  async findRelevantGuide(text: string): Promise<GuideMatch[]> { return (await this.analyze(text)).guides.filter(g=>g.confidence>=getConfig().localAI.guideThreshold); }
}
export const localAI = new LocalAIManager();
export const prepareLocalAI = () => localAI.initialize();
