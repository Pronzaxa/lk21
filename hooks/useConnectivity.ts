"use client";

import { useCallback, useEffect, useState } from "react";
import { checkConnectivity, connectivityToNetworkMode, type ConnectivityReport } from "@/lib/nuresq/connectivity";
import { hybridMode, queueManager } from '@/lib/nuresq/backend/runtime';
import { getConfig } from '@/config/nuresq.config';

const initialReport: ConnectivityReport = {
  state: "DEGRADED",
  checkedAt: new Date(0).toISOString(),
  browserOnline: true,
  publicEndpointReachable: false,
  backendConfigured: false,
  backendReachable: null,
};

export function useConnectivity() {
  const [report, setReport] = useState(initialReport);
  const refresh = useCallback(async () => {
    const state=await hybridMode.check();
    const next:ConnectivityReport={state:state==='ONLINE'?'CONNECTED':state==='OFFLINE'?'OFFLINE':state==='BACKEND_UNREACHABLE'?'BACKEND_UNREACHABLE':'DEGRADED',checkedAt:new Date().toISOString(),browserOnline:navigator.onLine,backendConfigured:Boolean(getConfig().backendUrl),backendReachable:state==='ONLINE',publicEndpointReachable:false};
    setReport(next);
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const update = () => { void refresh().then((next) => { if (!cancelled) setReport(next); }); };
    update();
    const interval = window.setInterval(update, getConfig().healthPollMs);
    const flush=()=>{void queueManager.flush().catch(()=>undefined);};
    const unsubscribe=hybridMode.subscribe(flush);
    const retry=window.setInterval(flush,5000);
    window.addEventListener('nuresq-repository-change',flush);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearInterval(retry);unsubscribe();window.removeEventListener('nuresq-repository-change',flush);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [refresh]);

  return { report, networkMode: connectivityToNetworkMode(report.state), refresh };
}
