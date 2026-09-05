import { randomUUID } from 'node:crypto';

const HAZARD_TYPES = new Set(['FLOOD','ROAD_CLOSED','LANDSLIDE','FIRE','EARTHQUAKE_IMPACT','OTHER']);
const DESTINATION_TYPES = new Set(['HOSPITAL','SHELTER','EVACUATION_POINT','COMMAND_POST','OTHER']);
const nowIso = () => new Date().toISOString();
const parseTime = value => { const time=Date.parse(value??''); return Number.isFinite(time)?new Date(time).toISOString():null; };
const freshness = (observed,retrieved) => { const age=Date.now()-Date.parse(observed??retrieved); return age<15*60_000?'FRESH':age<60*60_000?'AGING':age<24*60*60_000?'STALE':'VERY_STALE'; };
const distanceM = (a,b) => { const r=6371000, rad=x=>x*Math.PI/180, dLat=rad(b.lat-a.lat), dLon=rad(b.lon-a.lon); const q=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2; return 2*r*Math.atan2(Math.sqrt(q),Math.sqrt(1-q)); };

async function fetchJson(url, timeoutSeconds) {
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeoutSeconds*1000);
  try { const response=await fetch(url,{headers:{Accept:'application/json','User-Agent':'nuRESQ-map-data/1.0'},signal:controller.signal,cache:'no-store'}); if(!response.ok)throw new Error(`UPSTREAM_${response.status}`); return await response.json(); }
  finally { clearTimeout(timer); }
}
function point(lon,lat){return Number.isFinite(lon)&&Number.isFinite(lat)&&Math.abs(lon)<=180&&Math.abs(lat)<=90?{type:'Point',coordinates:[lon,lat]}:null;}
function inArea(item, query){
  const c=item.geometry?.type==='Point'?{lon:item.geometry.coordinates[0],lat:item.geometry.coordinates[1]}:null;
  if(!c)return true;
  if(query.type&&item.type!==query.type)return false;
  if(query.bbox&&!(c.lon>=query.bbox[0]&&c.lat>=query.bbox[1]&&c.lon<=query.bbox[2]&&c.lat<=query.bbox[3]))return false;
  if(query.lat!==null&&query.lon!==null&&query.radius!==null&&distanceM({lat:query.lat,lon:query.lon},c)>query.radius)return false;
  return true;
}
function normalizeQuery(url){
  const number=(key,fallback=null)=>{const raw=url.searchParams.get(key);if(raw===null||raw.trim()==='')return fallback;const n=Number(raw);return Number.isFinite(n)?n:fallback;};
  const lat=number('lat'),lon=number('lon'),radius=number('radius');
  if(lat!==null&&Math.abs(lat)>90||lon!==null&&Math.abs(lon)>180||radius!==null&&(radius<0||radius>100000))throw Object.assign(new Error('INVALID_AREA'),{status:400});
  let bbox=null; const raw=url.searchParams.get('bbox'); if(raw){const values=raw.split(',').map(Number);if(values.length!==4||values.some(n=>!Number.isFinite(n))||values[0]<-180||values[2]>180||values[1]<-90||values[3]>90||values[0]>values[2]||values[1]>values[3])throw Object.assign(new Error('INVALID_BBOX'),{status:400});bbox=values;}
  const type=url.searchParams.get('type')?.toUpperCase()||null;if(type&&!HAZARD_TYPES.has(type))throw Object.assign(new Error('INVALID_HAZARD_TYPE'),{status:400});
  return {lat,lon,radius,bbox,type};
}
function normalizeEarthquake(payload,retrievedAt){
  const quake=payload?.Infogempa?.gempa;if(!quake)return null; const coords=String(quake.Coordinates??'').split(',').map(Number); const geometry=point(coords[1],coords[0]); const observed=parseTime(quake.DateTime)||retrievedAt; const magnitude=Number(quake.Magnitude)||null;
  return {id:`bmkg-earthquake-${observed}`,source_id:`bmkg-${observed}`,type:'EARTHQUAKE_IMPACT',severity:magnitude>=6?'HIGH':magnitude>=4?'MEDIUM':'LOW',geometry,source:'BMKG',observed_at:observed,retrieved_at:retrievedAt,confidence:1,status:'ACTIVE',freshness:freshness(observed,retrievedAt),properties:{magnitude,region:String(quake.Wilayah??''),depth:String(quake.Kedalaman??'')}};
}
function normalizePeta(feature,retrievedAt,index){
  const p=feature?.properties??{}; const geometry=feature?.geometry??null; const raw=String(p.report_type??p.type??p.category??'').toLowerCase(); const type=raw.includes('flood')||raw.includes('banjir')?'FLOOD':raw.includes('landslide')||raw.includes('longsor')?'LANDSLIDE':raw.includes('fire')||raw.includes('kebakaran')?'FIRE':raw.includes('road')||raw.includes('jalan')?'ROAD_CLOSED':'OTHER'; const observed=parseTime(p.created_at??p.time??p.reported_at)||retrievedAt; const sourceId=String(p.id??p.report_id??`feature-${index}`);
  return {id:`petabencana-${sourceId}`,source_id:sourceId,type,severity:'MEDIUM',geometry,source:'PetaBencana',observed_at:observed,retrieved_at:retrievedAt,confidence:0.7,status:'ACTIVE',freshness:freshness(observed,retrievedAt),properties:{title:String(p.title??p.report_type??'Laporan warga'),raw_type:raw}};
}
function parsePeta(payload,retrievedAt){return (Array.isArray(payload?.features)?payload.features:[]).map((feature,i)=>normalizePeta(feature,retrievedAt,i)).filter(item=>item.geometry);}
const existingDestinations=[
  {id:'alun-alun-malang',name:'Alun-Alun Kota Malang',type:'EVACUATION_POINT',location:{lat:-7.98264,lon:112.63078},status:'UNKNOWN',verified:false,last_updated:null,capacity_status:'UNKNOWN',capabilities:[],source:'EXISTING_REFERENCE'},
  {id:'rs-saiful-anwar',name:'RSUD Dr. Saiful Anwar',type:'HOSPITAL',location:{lat:-7.97215,lon:112.63195},status:'UNKNOWN',verified:false,last_updated:null,capacity_status:'UNKNOWN',capabilities:[],source:'EXISTING_REFERENCE'},
  {id:'stadion-gajayana',name:'Stadion Gajayana',type:'SHELTER',location:{lat:-7.97503,lon:112.62156},status:'UNKNOWN',verified:false,last_updated:null,capacity_status:'UNKNOWN',capabilities:[],source:'EXISTING_REFERENCE'},
];
function parseDestinationQuery(url){const number=(key,fallback=null)=>{const raw=url.searchParams.get(key);if(raw===null||raw.trim()==='')return fallback;const n=Number(raw);return Number.isFinite(n)?n:fallback;};const lat=number('lat'),lon=number('lon'),radius=number('radius');if(lat!==null&&Math.abs(lat)>90||lon!==null&&Math.abs(lon)>180||radius!==null&&(radius<0||radius>100000))throw Object.assign(new Error('INVALID_AREA'),{status:400});let bbox=null;const raw=url.searchParams.get('bbox');if(raw){const values=raw.split(',').map(Number);if(values.length!==4||values.some(n=>!Number.isFinite(n))||values[0]<-180||values[2]>180||values[1]<-90||values[3]>90||values[0]>values[2]||values[1]>values[3])throw Object.assign(new Error('INVALID_BBOX'),{status:400});bbox=values;}const type=url.searchParams.get('type')?.toUpperCase()||null;if(type&&!DESTINATION_TYPES.has(type))throw Object.assign(new Error('INVALID_DESTINATION_TYPE'),{status:400});return {lat,lon,radius,bbox,type};}

export class MapDataService {
  constructor(db,env=process.env){this.db=db;this.ttl=Number(env.HAZARD_CACHE_TTL_SECONDS??300)*1000;this.timeout=Number(env.HAZARD_PROVIDER_TIMEOUT_SECONDS??5);this.demo=env.DEMO_DATA_ENABLED==='true';this.db.exec('CREATE TABLE IF NOT EXISTS hazards_cache (cache_key TEXT PRIMARY KEY, generated_at TEXT NOT NULL, last_successful_update TEXT, data_state TEXT NOT NULL, payload_json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS destinations_cache (cache_key TEXT PRIMARY KEY, generated_at TEXT NOT NULL, data_state TEXT NOT NULL, payload_json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS map_data_events (event_id TEXT PRIMARY KEY, created_at TEXT NOT NULL, kind TEXT NOT NULL, data_state TEXT NOT NULL);');}
  cacheRead(table,key){const row=this.db.prepare(`SELECT * FROM ${table} WHERE cache_key=?`).get(key);return row?{...row,payload:JSON.parse(row.payload_json)}:null;}
  cacheWrite(table,key,payload,state,lastUpdate=null){const generated=nowIso();this.db.prepare(`INSERT OR REPLACE INTO ${table} (cache_key,generated_at,last_successful_update,data_state,payload_json) VALUES (?,?,?,?,?)`).run(key,generated,lastUpdate,state,JSON.stringify(payload));return {generated_at:generated,last_successful_update:lastUpdate,data_state:state,payload};}
  async getHazards(url){const query=normalizeQuery(url);const key=JSON.stringify(query);const cached=this.cacheRead('hazards_cache',key);if(cached&&Date.now()-Date.parse(cached.generated_at)<this.ttl)return {...cached.payload,data_state:'CACHED',generated_at:cached.generated_at,last_successful_update:cached.last_successful_update};
    const retrievedAt=nowIso();const results=await Promise.allSettled([fetchJson('https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json',this.timeout),fetchJson('https://api.petabencana.id/reports?geoformat=geojson&timeperiod=10800',this.timeout)]);let hazards=[];if(results[0].status==='fulfilled'){const item=normalizeEarthquake(results[0].value,retrievedAt);if(item)hazards.push(item);}if(results[1].status==='fulfilled')hazards.push(...parsePeta(results[1].value,retrievedAt));hazards=hazards.filter(item=>inArea(item,query)).slice(0,100);if(results.some(r=>r.status==='fulfilled')){const response={generated_at:retrievedAt,last_successful_update:retrievedAt,data_state:'LIVE',hazards};this.cacheWrite('hazards_cache',key,response,'LIVE',retrievedAt);this.db.prepare('INSERT INTO map_data_events VALUES (?,?,?,?)').run(randomUUID(),retrievedAt,'HAZARD_REFRESH','LIVE');return response;}if(cached){return {...cached.payload,data_state:'STALE_CACHE',generated_at:cached.generated_at,last_successful_update:cached.last_successful_update};}return {generated_at:retrievedAt,last_successful_update:null,data_state:'UNAVAILABLE',hazards:[]};}
  async getDestinations(url){const query=parseDestinationQuery(url);let destinations=existingDestinations.filter(item=>!query.type||item.type===query.type);if(query.lat!==null&&query.lon!==null&&query.radius!==null)destinations=destinations.filter(item=>distanceM({lat:query.lat,lon:query.lon},item.location)<=query.radius);if(query.bbox)destinations=destinations.filter(item=>inArea({geometry:{type:'Point',coordinates:[item.location.lon,item.location.lat]},type:item.type},query));return {generated_at:'2026-09-06T00:00:00.000Z',data_state:'CACHED',source_status:'EXISTING_REFERENCE',destinations:destinations.slice(0,100)};}
  async getStatus(){const hazard=this.db.prepare('SELECT generated_at,data_state FROM hazards_cache ORDER BY generated_at DESC LIMIT 1').get();return {generated_at:nowIso(),hazards:{available:Boolean(hazard),updated_at:hazard?.generated_at??null,data_state:hazard?.data_state??'UNKNOWN'},destinations:{available:true,updated_at:null,data_state:'CACHED',source_status:'EXISTING_REFERENCE'}};}
}
export { normalizeQuery };
