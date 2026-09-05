import 'fake-indexeddb/auto';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({configFile:false,root,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false,watch:null}});after(()=>vite.close());
const {fuseFacts}=await vite.ssrLoadModule('/lib/nuresq/ai/FactFusion.ts');
const {HybridModeManager}=await vite.ssrLoadModule('/lib/nuresq/backend/HybridModeManager.ts');
const {QueueManager}=await vite.ssrLoadModule('/lib/nuresq/backend/QueueManager.ts');
const {BackendClient}=await vite.ssrLoadModule('/lib/nuresq/backend/BackendClient.ts');
const {EmergencyRepository:repo}=await vite.ssrLoadModule('/lib/nuresq/emergency-repository.ts');
const {applyConfirmedIncidentUpdate,createUserMessage}=await vite.ssrLoadModule('/lib/nuresq/message-service.ts');
test('fetch retains browser global receiver',async()=>{
 const client=new BackendClient(async()=>'',async function(){assert.equal(this,globalThis);return new Response(JSON.stringify({status:'ok',database:'ok'}));});
 assert.equal((await client.health()).status,'ok');
});
test('explicit negation defeats high-confidence AI; low confidence unknown',()=>{
 const ai={state:'READY',classification:{label:'FIRE',source:'LOCAL_AI',confidence:.99},guides:[]};
 assert.equal(fuseFacts('tidak ada kebakaran',ai).incidentType.value,'OTHER');
 assert.equal(fuseFacts('halo',{...ai,classification:{...ai.classification,confidence:.3}}).incidentType.value,'OTHER');
 assert.equal(fuseFacts('asap tebal',ai).incidentType.source,'RULE_PARSER');
});
test('natural phrases produce explicit facts and locked safety',()=>{
 const facts=fuseFacts('Saya dan ibu kejebak banjir, air sudah sepinggang, ibu tidak bisa berjalan',null,'Banjir');
 assert.equal(facts.parsed.victimCount,2);assert.equal(facts.parsed.waterLevel,90);assert.equal(facts.parsed.mobilityLimited,true);
 assert.equal(facts.locked_priority,facts.safety.level);
 for(const [text,label] of [['air rumah saya makin naik','FLOOD'],['rumah kebakaran','FIRE'],['ada gempa barusan','EARTHQUAKE'],['jalan tertutup longsor','LANDSLIDE'],['ibu saya sesak','MEDICAL'],['banjirnya makin tinggi','FLOOD'],['gimana kalau gempa','EARTHQUAKE']])assert.equal(fuseFacts(text,null).incidentType.value,label);
});
test('mode uses actual health; restores without reload',async()=>{
 let reachable=false;const mode=new HybridModeManager({health:async()=>{if(!reachable)throw Error();},getCapabilities:async()=>({backend:true,incident_sync:true,assistant_online:true})});
 assert.equal(await mode.check(false),'OFFLINE');assert.equal(await mode.check(true),'BACKEND_UNREACHABLE');reachable=true;assert.equal(await mode.check(true),'ONLINE');reachable=false;assert.equal(await mode.check(true),'BACKEND_UNREACHABLE');
});
test('backend invalid ACK cannot mark delivered; network 500 leaves queue',async()=>{
 const client=new BackendClient(async()=> 'a'.repeat(64),async()=>new Response(JSON.stringify({accepted:true}),{status:200}));
 await assert.rejects(client.submitIncident({incident_id:randomUUID()}),/INVALID_ACK/);
});
test('original first, backoff, retry and immutable original ACK on updates',async()=>{
 const item={incident_id:randomUUID(),timestamp:new Date().toISOString(),type:'Banjir',description:'kami berdua',incident_lifecycle:'ACTIVE',risk_level:'PRIORITAS TINGGI',latitude:null,longitude:null,victim_count:2,delivery_status:'LOCAL_SAVED',acknowledgement:null};
 await repo.saveIncident(item);
 const message=createUserMessage({incident:item,text:'air sekarang makin tinggi'});await repo.saveMessage({...message,deliveryState:'LOCAL_SAVED'});
 let fail=true;const calls=[];const backend={submitIncident:async payload=>{calls.push('original');if(fail)throw Error('BACKEND_500');return {accepted:true,incident_id:payload.incident_id,ack_id:'original-ack',received_at:new Date().toISOString()};},submitIncidentUpdate:async payload=>{calls.push('update');return {accepted:true,incident_id:payload.incident_id,update_id:payload.update_id,ack_id:'update-ack',received_at:new Date().toISOString()};}};
 const queue=new QueueManager(repo,backend,()=>true);await queue.flush();assert.deepEqual(calls,['original']);assert.ok((await repo.getOutbox()).find(x=>x.kind==='incident').nextAttemptAt>Date.now());
 fail=false;for(const entry of await repo.getOutbox())await repo.saveOutbox({...entry,nextAttemptAt:0});await queue.flush();assert.deepEqual(calls,['original','original','update']);
 const active=await repo.getActiveIncident();assert.equal(active.acknowledgement.id,'original-ack');
 const changed=applyConfirmedIncidentUpdate(message,active);assert.equal(changed.incident.acknowledgement.id,'original-ack');await repo.saveIncidentAndMessage(changed.incident,changed.message);await queue.flush();assert.equal((await repo.getActiveIncident()).acknowledgement.id,'original-ack');
 assert.equal((await repo.getIncidentHistory())[0].timestamp,item.timestamp);
});
