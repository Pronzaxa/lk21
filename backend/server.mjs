import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { coordinator } from './providers.mjs';

const uuid = /^(?:NR-)?[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const priorities = ['PRIORITAS SEDANG','PRIORITAS TINGGI','KRITIS'];
const rank = p => priorities.indexOf(p);
const types = ['Banjir','Gempa','Longsor','Kebakaran','Darurat Medis','Lainnya'];
const validDate = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
const hash = v => createHash('sha256').update(v).digest('hex');
const fail = (code, status=400) => { throw Object.assign(new Error(code), { code, status }); };
const guides = JSON.parse(readFileSync(new URL('../public/emergency-guides/index.json', import.meta.url), 'utf8'));
export function createBackend(options={}) {
  const production = (options.env ?? process.env.APP_ENV) === 'production';
  const databasePath = options.databasePath ?? process.env.DATABASE_PATH ?? './data/nuresq.sqlite';
  if (databasePath !== ':memory:') mkdirSync(path.dirname(path.resolve(databasePath)), { recursive:true });
  const db = new DatabaseSync(databasePath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS incidents (incident_id TEXT PRIMARY KEY, owner TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, incident_type TEXT NOT NULL, priority TEXT NOT NULL, payload_json TEXT NOT NULL, lifecycle_state TEXT NOT NULL, received_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS incident_acknowledgements (incident_id TEXT PRIMARY KEY REFERENCES incidents(incident_id), ack_id TEXT UNIQUE NOT NULL, received_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS incident_updates (update_id TEXT PRIMARY KEY, incident_id TEXT NOT NULL REFERENCES incidents(incident_id), created_at TEXT NOT NULL, payload_json TEXT NOT NULL, priority TEXT NOT NULL, ack_id TEXT NOT NULL, received_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS assistant_events (event_id TEXT PRIMARY KEY, created_at TEXT NOT NULL, mode TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS system_events (event_id TEXT PRIMARY KEY, created_at TEXT NOT NULL, kind TEXT NOT NULL);`);
  const origins = new Set(options.origins ?? (process.env.CORS_ORIGINS ?? 'http://127.0.0.1:4173,http://localhost:4173,http://127.0.0.1:8080').split(','));
  const allowFile = !production && (options.allowFile ?? process.env.ALLOW_FILE_ORIGIN !== 'false');
  const buckets = new Map();
  const owned = (id, owner) => { const row = db.prepare('SELECT * FROM incidents WHERE incident_id=? AND owner=?').get(id, owner); if (!row) fail('NOT_FOUND',404); return row; };
  const send = (res,status,data) => { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(JSON.stringify(data)); };
  const server = http.createServer(async (req,res) => {
    try {
      const origin=req.headers.origin;
      if (origin && !origins.has(origin) && !(origin==='null' && allowFile)) fail('ORIGIN_DENIED',403);
      if (origin) { res.setHeader('Access-Control-Allow-Origin',origin); res.setHeader('Vary','Origin'); }
      if (req.method==='OPTIONS') { res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, Idempotency-Key'); res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS'); res.writeHead(204); res.end(); return; }
      const url=new URL(req.url,'http://localhost');
      if (req.method==='GET' && url.pathname==='/health') { db.prepare('SELECT 1').get(); return send(res,200,{status:'ok',version:'0.2.0',timestamp:new Date().toISOString(),database:'ok'}); }
      if (req.method==='GET' && url.pathname==='/api/capabilities') return send(res,200,{backend:true,incident_sync:true,assistant_online:true,cloud_agent:false,hazard_live:false,routing_engine:false,responder_channel:false});
      const token=(req.headers.authorization ?? '').replace(/^Bearer /,'');
      if (!/^[a-f0-9]{64}$/i.test(token)) fail('UNAUTHORIZED',401);
      const owner=hash(token);
      let body=null;
      if (req.method==='POST') {
        if (!(req.headers['content-type']??'').startsWith('application/json')) fail('CONTENT_TYPE',415);
        let bytes=0; const chunks=[];
        for await (const chunk of req) { bytes+=chunk.length; if (bytes>32768) fail('PAYLOAD_TOO_LARGE',413); chunks.push(chunk); }
        try { body=JSON.parse(Buffer.concat(chunks).toString()); } catch { fail('INVALID_JSON'); }
        if (!body || typeof body!=='object' || Array.isArray(body)) fail('INVALID_SCHEMA');
      }
      const now=new Date().toISOString();
      // A modest per-address limit bounds random bearer-token abuse. Idempotent retries are exempt below.
      const rate=() => { const key=req.socket.remoteAddress; const stamp=Date.now(); const bucket=buckets.get(key); if (!bucket || stamp-bucket.at>60000) buckets.set(key,{at:stamp,n:1}); else if (++bucket.n>120) fail('RATE_LIMITED',429); if (buckets.size>10000) for(const [k,v] of buckets) if(stamp-v.at>60000) buckets.delete(k); };
      if (req.method==='POST' && url.pathname==='/api/incidents') {
        const b=body;
        if (!uuid.test(b.incident_id) || b.schema_version!==1 || !types.includes(b.type) || !priorities.includes(b.risk_level) || b.locked_priority!==b.risk_level || !validDate(b.timestamp) || typeof b.description!=='string' || b.description.length>12000 || !['ACTIVE','RESOLVED','CANCELLED'].includes(b.incident_lifecycle)) fail('INVALID_INCIDENT');
        if ((b.latitude===null)!==(b.longitude===null) || (b.latitude!==null && (!Number.isFinite(b.latitude)||Math.abs(b.latitude)>90||!Number.isFinite(b.longitude)||Math.abs(b.longitude)>180))) fail('INVALID_COORDINATES');
        if (b.victim_count!==null && (!Number.isInteger(b.victim_count)||b.victim_count<1||b.victim_count>999)) fail('INVALID_VICTIM_COUNT');
        const previous=db.prepare('SELECT owner FROM incidents WHERE incident_id=?').get(b.incident_id);
        if(previous) { if(previous.owner!==owner) fail('NOT_FOUND',404); const ack=db.prepare('SELECT * FROM incident_acknowledgements WHERE incident_id=?').get(b.incident_id); return send(res,200,{accepted:true,incident_id:b.incident_id,...ack}); }
        rate(); const ack=randomUUID();
        db.exec('BEGIN IMMEDIATE');
        try { db.prepare('INSERT INTO incidents VALUES (?,?,?,?,?,?,?,?,?)').run(b.incident_id,owner,b.timestamp,now,b.type,b.risk_level,JSON.stringify(b),b.incident_lifecycle,now); db.prepare('INSERT INTO incident_acknowledgements VALUES (?,?,?)').run(b.incident_id,ack,now); db.exec('COMMIT'); } catch(e) { db.exec('ROLLBACK'); throw e; }
        if(options.logging!==false) console.info('[INCIDENT] received',b.incident_id,'[ACK]',ack);
        return send(res,201,{accepted:true,incident_id:b.incident_id,ack_id:ack,received_at:now});
      }
      const updatePath=url.pathname.match(/^\/api\/incidents\/([^/]+)\/updates$/);
      if(req.method==='POST' && updatePath) {
        const id=decodeURIComponent(updatePath[1]); const row=owned(id,owner); const b=body;
        if(!uuid.test(b.update_id)||b.schema_version!==1||b.incident_id!==id||!validDate(b.created_at)||typeof b.raw_text!=='string'||b.raw_text.length>12000||!priorities.includes(b.locked_priority)||!b.facts||typeof b.facts!=='object'||Array.isArray(b.facts)) fail('INVALID_UPDATE');
        const previous=db.prepare('SELECT * FROM incident_updates WHERE update_id=?').get(b.update_id);
        if(previous) { if(previous.incident_id!==id) fail('UPDATE_CONFLICT',409); return send(res,200,{accepted:true,update_id:b.update_id,incident_id:id,ack_id:previous.ack_id,received_at:previous.received_at}); }
        rate(); const priority=rank(row.priority)>rank(b.locked_priority)?row.priority:b.locked_priority; const ack=randomUUID();
        db.exec('BEGIN IMMEDIATE');
        try { db.prepare('INSERT INTO incident_updates VALUES (?,?,?,?,?,?,?)').run(b.update_id,id,b.created_at,JSON.stringify(b),priority,ack,now); db.prepare('UPDATE incidents SET priority=?, updated_at=? WHERE incident_id=?').run(priority,now,id); db.exec('COMMIT'); } catch(e) {db.exec('ROLLBACK');throw e;}
        if(options.logging!==false) console.info('[UPDATE] received',b.update_id,'[ACK]',ack);
        return send(res,201,{accepted:true,update_id:b.update_id,incident_id:id,ack_id:ack,received_at:now,locked_priority:priority});
      }
      rate();
      if(req.method==='GET' && url.pathname==='/api/incidents') return send(res,200,db.prepare('SELECT incident_id,created_at,priority,lifecycle_state,received_at FROM incidents WHERE owner=? ORDER BY received_at DESC LIMIT 100').all(owner));
      const detail=url.pathname.match(/^\/api\/incidents\/([^/]+)$/);
      if(req.method==='GET' && detail) { const row=owned(decodeURIComponent(detail[1]),owner); delete row.owner; return send(res,200,{...row,payload:JSON.parse(row.payload_json),acknowledgement:db.prepare('SELECT * FROM incident_acknowledgements WHERE incident_id=?').get(row.incident_id)}); }
      if(req.method==='GET' && url.pathname==='/api/guides') return send(res,200,guides);
      if(req.method==='GET' && url.pathname.startsWith('/api/guides/')) {const guide=guides.find(g=>g.id===url.pathname.split('/').pop()); if(!guide) fail('NOT_FOUND',404); return send(res,200,guide);}
      if(req.method==='POST' && url.pathname==='/api/assistant/analyze') {
        if(typeof body.text!=='string'||!body.text.trim()||body.text.length>2000||!body.local_analysis||!priorities.includes(body.local_analysis.locked_priority)) fail('INVALID_ANALYSIS');
        if(body.incident_id) owned(body.incident_id,owner);
        db.prepare('INSERT INTO assistant_events VALUES (?,?,?)').run(randomUUID(),now,'BACKEND_RULED');
        const intent=typeof body.local_analysis.intent==='string'?body.local_analysis.intent:'OTHER';
        const ids=guides.filter(g=>g.intent===intent).map(g=>g.id);
        return send(res,200,{mode:'BACKEND_RULED',intent,guide_ids:ids,locked_priority:body.local_analysis.locked_priority,...await coordinator.process()});
      }
      fail('NOT_FOUND',404);
    } catch(e) { if(!res.headersSent) send(res,e.status??500,{error:{code:e.code??'INTERNAL_ERROR',message:e.status?'Permintaan tidak dapat diproses.':'Layanan belum dapat memproses permintaan.'}}); else res.end(); }
  });
  server.requestTimeout=10000;
  server.headersTimeout=10000;
  return { server, db, close: () => new Promise(resolve=>server.close(()=>{db.close();resolve();})) };
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const app=createBackend();
  app.server.listen(Number(process.env.PORT??8787),process.env.HOST??'127.0.0.1',()=>console.info('[HEALTH] backend ready; [CLOUD AGENT] disabled'));
  process.on('SIGINT',()=>void app.close()); process.on('SIGTERM',()=>void app.close());
}
