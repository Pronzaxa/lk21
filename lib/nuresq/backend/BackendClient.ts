import { getConfig } from '../../../config/nuresq.config';
export interface BackendCapabilities { backend:boolean; incident_sync:boolean; assistant_online:boolean; cloud_agent:boolean; responder_channel:boolean; }
export interface ServerAck {accepted:true;incident_id:string;update_id?:string;ack_id:string;received_at:string;}
export class BackendClient {
  constructor(private token:()=>Promise<string>,private fetcher:typeof fetch=fetch) {}
  async request(path:string,body?:unknown,publicRequest=false) {
    const config=getConfig();
    if(config.mode==='FORCE_OFFLINE'||(typeof navigator!=='undefined'&&navigator.onLine===false))throw new Error('OFFLINE');
    if(!config.backendUrl)throw new Error('LOCAL_ONLY');
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),config.backendHealthTimeoutMs);
    try {
      const response=await this.fetcher.call(globalThis,`${config.backendUrl}${path}`,{method:body===undefined?'GET':'POST',signal:controller.signal,cache:'no-store',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(publicRequest?{}:{Authorization:`Bearer ${await this.token()}`})},body:body===undefined?undefined:JSON.stringify(body)});
      if(!response.ok)throw new Error(`BACKEND_${response.status}`);
      return await response.json();
    } finally {clearTimeout(timer);}
  }
  async health() {const result=await this.request('/health',undefined,true);if(result?.status!=='ok'||result.database!=='ok')throw new Error('INVALID_HEALTH');return result;}
  async getCapabilities():Promise<BackendCapabilities> {const result=await this.request('/api/capabilities',undefined,true);if(result?.backend!==true||typeof result.incident_sync!=='boolean'||typeof result.assistant_online!=='boolean')throw new Error('INVALID_CAPABILITIES');return result;}
  async submitIncident(payload:Record<string,unknown>) {return this.ack(await this.request('/api/incidents',payload),String(payload.incident_id));}
  async submitIncidentUpdate(payload:Record<string,unknown>) {return this.ack(await this.request(`/api/incidents/${encodeURIComponent(String(payload.incident_id))}/updates`,payload),String(payload.incident_id),String(payload.update_id));}
  private ack(result:ServerAck,id:string,updateId?:string) {
    if(result?.accepted!==true||result.incident_id!==id||!result.ack_id?.trim()||!Number.isFinite(Date.parse(result.received_at))||(updateId&&result.update_id!==updateId))throw new Error('INVALID_ACK');
    return result;
  }
  assistantAnalyze(body:unknown){return this.request('/api/assistant/analyze',body);}
  getGuides(){return this.request('/api/guides');}
  getHazards(query=''){return this.request(`/api/hazards${query}`,undefined,true);}
  getDestinations(query=''){return this.request(`/api/destinations${query}`,undefined,true);}
  getMapDataStatus(){return this.request('/api/map-data/status',undefined,true);}
}
