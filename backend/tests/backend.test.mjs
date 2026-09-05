import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createBackend } from '../server.mjs';
const token='a'.repeat(64);
const capsule=()=>({incident_id:randomUUID(),schema_version:1,incident_lifecycle:'ACTIVE',timestamp:'2026-09-01T01:00:00Z',type:'Banjir',risk_level:'KRITIS',locked_priority:'KRITIS',description:'Kami terjebak',latitude:null,longitude:null,victim_count:2});
test('backend persistence, ACK, ownership, validation and restart',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'nuresq-backend-'));const databasePath=path.join(dir,'db.sqlite');let app;
 try{
  app=createBackend({databasePath,logging:false});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  let base=`http://127.0.0.1:${app.server.address().port}`;
  const req=(url,body,auth=token,extra={})=>fetch(base+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth}`,...extra},body:body?JSON.stringify(body):undefined});
  assert.equal((await (await req('/health')).json()).database,'ok');
  assert.equal((await (await req('/api/capabilities')).json()).responder_channel,false);
  const item=capsule();const ack=await (await req('/api/incidents',item)).json();assert.ok(ack.ack_id);
  assert.equal((await (await req('/api/incidents',item)).json()).ack_id,ack.ack_id);
  assert.equal((await req('/api/incidents/'+item.incident_id,null,'b'.repeat(64))).status,404);
  assert.equal((await req('/api/incidents',{...capsule(),latitude:999,longitude:0})).status,400);
  assert.equal((await req('/api/incidents',{...capsule(),schema_version:99})).status,400);
  assert.equal((await req('/api/incidents',{...capsule(),incident_id:'bad'})).status,400);
  assert.equal((await req('/api/incidents',{...capsule(),risk_level:'LOW'})).status,400);
  assert.equal((await req('/api/incidents',null,'bad')).status,401);
  assert.equal((await req('/health',null,token,{Origin:'https://evil.invalid'})).status,403);
  const update={schema_version:1,update_id:randomUUID(),incident_id:item.incident_id,created_at:'2026-09-02T01:00:00Z',raw_text:'air makin tinggi',facts:{},locked_priority:'PRIORITAS SEDANG'};
  const updateAck=await (await req(`/api/incidents/${item.incident_id}/updates`,update)).json();assert.ok(updateAck.ack_id);assert.notEqual(updateAck.ack_id,ack.ack_id);
  assert.equal((await (await req(`/api/incidents/${item.incident_id}/updates`,update)).json()).ack_id,updateAck.ack_id);
  const detail=await (await req('/api/incidents/'+item.incident_id)).json();assert.equal(detail.priority,'KRITIS');assert.equal(detail.acknowledgement.ack_id,ack.ack_id);assert.equal(detail.created_at,item.timestamp);
  const analysis=await (await req('/api/assistant/analyze',{text:'banjir',local_analysis:{intent:'FLOOD',locked_priority:'KRITIS'}})).json();assert.equal(analysis.cloud_agent_used,false);assert.equal(analysis.locked_priority,'KRITIS');
  await app.close();app=createBackend({databasePath,logging:false});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;
  assert.equal((await (await req('/api/incidents/'+item.incident_id)).json()).acknowledgement.ack_id,ack.ack_id);
  assert.equal((await (await req('/api/incidents')).json()).length,1);
 }finally{if(app)await app.close();rmSync(dir,{recursive:true,force:true});}
});
