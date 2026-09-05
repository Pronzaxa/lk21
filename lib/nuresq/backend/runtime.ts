import { EmergencyRepository } from '../emergency-repository';
import { BackendClient } from './BackendClient';
import { HybridModeManager } from './HybridModeManager';
import { QueueManager } from './QueueManager';
export const backendClient=new BackendClient(()=>EmergencyRepository.getDeviceToken());
export const hybridMode=new HybridModeManager(backendClient);
export const queueManager=new QueueManager(EmergencyRepository,backendClient,()=>hybridMode.state==='ONLINE');
