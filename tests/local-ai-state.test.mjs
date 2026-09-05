import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,root:fileURLToPath(new URL('..',import.meta.url)),optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,hmr:false,watch:null}});after(()=>vite.close());
const {LocalAIManager}=await vite.ssrLoadModule('/lib/nuresq/ai/LocalAIManager.ts');
globalThis.Worker=class {};
globalThis.document={baseURI:'http://localhost/'};
globalThis.location={protocol:'http:'};
globalThis.window={__NURESQ_CONFIG__:{localAI:{loadTimeoutMs:25,inferenceTimeoutMs:25}}};
test('model ready/missing/corrupt, initialization and inference timeout use honest states',async()=>{
 for(const outcome of ['ready','MODEL_NOT_INSTALLED','CORRUPT','load-hang','inference-hang']){
  let creations=0,terminated=false;
  const manager=new LocalAIManager(()=>{creations++;return {terminate(){terminated=true;},postMessage(message){
   if(outcome==='load-hang'||(outcome==='inference-hang'&&message.kind!=='initialize'))return;
   queueMicrotask(()=>this.onmessage({data:{id:message.id,...(message.kind==='initialize'?outcome==='MODEL_NOT_INSTALLED'||outcome==='CORRUPT'?{error:outcome}:{result:true}:{result:{classification:{label:'FLOOD',source:'LOCAL_AI',confidence:.9},guides:[{id:'banjir',confidence:.8}]}})}}));
  }};});
  await Promise.all([manager.initialize(),manager.initialize()]);assert.equal(creations,1);
  if(outcome==='ready'){assert.equal(manager.getState(),'READY');assert.equal((await manager.analyze('air naik')).classification.label,'FLOOD');manager.dispose();}
  else if(outcome==='MODEL_NOT_INSTALLED'){assert.equal(manager.getState(),'MODEL_NOT_INSTALLED');assert.equal((await manager.analyze('banjir')).classification.source,'RULE_PARSER');}
  else if(outcome==='inference-hang'){assert.equal((await manager.analyze('banjir')).state,'FAILED');assert.ok(terminated);}
  else assert.equal(manager.getState(),'FAILED');
 }
});
