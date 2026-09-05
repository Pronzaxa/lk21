import { getConfig } from '../../../config/nuresq.config';
import type { BackendClient, ServerAck } from './BackendClient';
export interface OutboxItem {id:string;kind:'incident'|'update';incidentId:string;createdAt:string;payload:Record<string,unknown>;attempts:number;nextAttemptAt:number;ack?:ServerAck;messageId?:string;error?:string;}
export interface OutboxStore {getOutbox():Promise<OutboxItem[]>;saveOutbox(item:OutboxItem):Promise<void>;ackOutbox(item:OutboxItem,ack:ServerAck):Promise<void>;canSendIncident?(id:string):Promise<boolean>;}
export class QueueManager {
  private running:Promise<void>|null=null;
  constructor(private store:OutboxStore,private client:BackendClient,private online:()=>boolean){}
  flush(){if(this.running)return this.running;this.running=this.run().finally(()=>{this.running=null;});return this.running;}
  private async run(){
    if(!getConfig().offlineQueue.enabled||!this.online()||getConfig().mode==='FORCE_OFFLINE')return;
    const items=(await this.store.getOutbox()).sort((a,b)=>a.kind===b.kind?a.createdAt.localeCompare(b.createdAt):a.kind==='incident'?-1:1);
    const acked=new Set(items.filter(x=>x.kind==='incident'&&x.ack).map(x=>x.incidentId));
    const blocked=new Set<string>();
    for(const item of items){
      if(!this.online()||getConfig().mode==='FORCE_OFFLINE')break;
      if(item.ack)continue;
      if(this.store.canSendIncident&&!await this.store.canSendIncident(item.incidentId))continue;
      if(blocked.has(item.incidentId))continue;
      if(item.nextAttemptAt>Date.now()||(item.kind==='update'&&!acked.has(item.incidentId))){blocked.add(item.incidentId);continue;}
      try{const ack=item.kind==='incident'?await this.client.submitIncident(item.payload):await this.client.submitIncidentUpdate(item.payload);await this.store.ackOutbox(item,ack);if(item.kind==='incident')acked.add(item.incidentId);}
      catch(error){const steps=getConfig().offlineQueue.retryMs;await this.store.saveOutbox({...item,attempts:item.attempts+1,nextAttemptAt:Date.now()+steps[Math.min(item.attempts,steps.length-1)],error:error instanceof Error?error.message:'SYNC_FAILED'});blocked.add(item.incidentId);}
    }
  }
}
