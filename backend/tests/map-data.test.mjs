import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createBackend } from '../server.mjs';

const originalFetch=globalThis.fetch;
let app;
let base;
const bmkg={Infogempa:{gempa:{Coordinates:'-7.97,112.63',DateTime:'2026-09-06T00:00:00Z',Magnitude:'4.3',Wilayah:'Malang',Kedalaman:'10 km'}}};
const peta={features:[{geometry:{type:'Point',coordinates:[112.62,-7.98]},properties:{id:'r-1',report_type:'flood',created_at:'2026-09-06T00:01:00Z'}}]};
globalThis.fetch=async url=>new Response(String(url).includes('autogempa')?JSON.stringify(bmkg):JSON.stringify(peta),{status:200,headers:{'content-type':'application/json'}});
app=createBackend({databasePath:':memory:',logging:false,envMap:{HAZARD_CACHE_TTL_SECONDS:'300',HAZARD_PROVIDER_TIMEOUT_SECONDS:'1'}});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
base=`http://127.0.0.1:${app.server.address().port}`;
after(async()=>{globalThis.fetch=originalFetch;await app.close();});

test('map capabilities are truthful and map endpoints are public',async()=>{
 const caps=await (await originalFetch(`${base}/api/capabilities`)).json();assert.equal(caps.hazard_data,true);assert.equal(caps.destination_data,true);assert.equal(caps.route_risk_service,false);
 const hazards=await (await originalFetch(`${base}/api/hazards?lat=-7.98&lon=112.63&radius=5000`)).json();assert.equal(hazards.data_state,'LIVE');assert.equal(hazards.hazards.length,2);assert.ok(hazards.hazards.every(item=>item.source&&item.observed_at&&item.retrieved_at&&item.geometry));
 const snapshot=await (await originalFetch(`${base}/api/hazards/snapshot`)).json();assert.ok(['LIVE','CACHED'].includes(snapshot.data_state));
 const destinations=await (await originalFetch(`${base}/api/destinations?type=HOSPITAL`)).json();assert.equal(destinations.destinations.length,1);assert.equal(destinations.destinations[0].verified,false);assert.equal(destinations.destinations[0].status,'UNKNOWN');assert.equal(destinations.destinations[0].capacity_status,'UNKNOWN');
});

test('area validation, stale cache and unavailable response are explicit',async()=>{
 assert.equal((await originalFetch(`${base}/api/hazards?bbox=1,2,3`)).status,400);
 globalThis.fetch=async()=>{throw new Error('upstream down');};
 app.db.prepare('UPDATE hazards_cache SET generated_at=?').run(new Date(Date.now()-3600000).toISOString());
 const stale=await (await originalFetch(`${base}/api/hazards?lat=-7.98&lon=112.63&radius=5000`)).json();assert.equal(stale.data_state,'STALE_CACHE');assert.equal(stale.hazards.length,2);
 const unavailable=await (await originalFetch(`${base}/api/hazards?bbox=10,10,11,11`)).json();assert.equal(unavailable.data_state,'UNAVAILABLE');assert.deepEqual(unavailable.hazards,[]);
});
