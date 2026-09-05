import {createServer} from 'vite';
import {writeFile} from 'node:fs/promises';
const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,watch:null},optimizeDeps:{noDiscovery:true,include:[]}});
try {
 const {detectSafetySignals,parseEmergencyDescription}=await vite.ssrLoadModule('/lib/nuresq/safety.ts');
 const cases=[['korban bernapas',false,'NOT_BREATHING'],['korban belum bernapas',true,'NOT_BREATHING'],['korban belum sadar',true,'UNCONSCIOUS'],['air tidak sampai pinggang',false,'WATER'],['tidak ada asap tebal',false,'FIRE_SMOKE']];
 const results=cases.map(([text,expected,signal])=>{const actual=signal==='WATER'?parseEmergencyDescription(text).waterLevel>=70:detectSafetySignals(text).some(s=>s.id===signal);return {text,expected,actual,pass:expected===actual};});
 await writeFile('BLOCKING_SAFETY_CORE_ISSUES.md','# Existing Safety Core — blocking operational issues\n\nSource safety.ts is intentionally unchanged, as requested. These are actual executed probes, not presumed fixes. Do not treat this foundation build as validated emergency triage until a separate safety-core revision passes these examples.\n\n'+results.map(r=>`- ${r.pass?'PASS':'FAIL'}: "${r.text}" — expected ${r.expected}, observed ${r.actual}.`).join('\n')+'\n');
 console.log(JSON.stringify(results));
} finally {await vite.close();}
