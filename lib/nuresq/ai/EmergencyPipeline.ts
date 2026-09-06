import { localAI } from './LocalAIManager';
import { fuseFacts } from './FactFusion';
import { backendClient, hybridMode } from '../backend/runtime';
import { getAssistantModelPreference } from '../../../config/nuresq.config';
import type { SosDraft } from '../types';
export async function analyzeLocally(text:string,confirmedType:SosDraft['type']=null){
  const ai=await localAI.analyze(text);
  const facts=fuseFacts(text,ai,confirmedType);
  return {...facts,ai};
}
export async function enrichAssistant(text:string,local:Awaited<ReturnType<typeof analyzeLocally>>,incidentId:string|null=null){
  if(getAssistantModelPreference()==='LOCAL')return null;
  if(hybridMode.state!=='ONLINE'||!hybridMode.capabilities?.assistant_online)return null;
  try{
    const result=await backendClient.assistantAnalyze({text,incident_id:incidentId,local_analysis:{intent:local.incidentType.value,locked_priority:local.locked_priority}});
    if(result?.locked_priority!==local.locked_priority||!Array.isArray(result.guide_ids))return null;
    return result;
  }catch{return null;}
}
