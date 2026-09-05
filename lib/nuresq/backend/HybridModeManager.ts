import { getConfig } from '../../../config/nuresq.config';
import { BackendClient, type BackendCapabilities } from './BackendClient';
export type HybridMode = 'OFFLINE'|'LOCAL_ONLY'|'ONLINE'|'DEGRADED'|'BACKEND_UNREACHABLE';
export class HybridModeManager {
  state:HybridMode='LOCAL_ONLY';capabilities:BackendCapabilities|null=null;
  private listeners=new Set<()=>void>();private checking:Promise<HybridMode>|null=null;
  constructor(readonly client:BackendClient){}
  subscribe=(fn:()=>void)=>{this.listeners.add(fn);return ()=>{this.listeners.delete(fn);};};
  private set(state:HybridMode){this.state=state;if(state!=='ONLINE')this.capabilities=null;this.listeners.forEach(fn=>fn());return state;}
  check(browserOnline=typeof navigator==='undefined'||navigator.onLine!==false):Promise<HybridMode>{
    const config=getConfig();
    if(config.mode==='FORCE_OFFLINE'||!browserOnline)return Promise.resolve(this.set('OFFLINE'));
    if(!config.backendUrl)return Promise.resolve(this.set('LOCAL_ONLY'));
    if(this.checking)return this.checking;
    this.checking=(async()=>{try{
      await this.client.health();const caps=await this.client.getCapabilities();
      if(getConfig().mode==='FORCE_OFFLINE'||(typeof navigator!=='undefined'&&navigator.onLine===false))return this.set('OFFLINE');
      this.capabilities=caps;return this.set(caps.incident_sync?'ONLINE':'DEGRADED');
    }catch{return this.set('BACKEND_UNREACHABLE');}finally{this.checking=null;}})();
    return this.checking;
  }
}
