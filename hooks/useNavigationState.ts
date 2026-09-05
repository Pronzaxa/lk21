"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { navigationStateReducer } from "@/lib/nuresq/navigation-state";
import type { NavigationGestureKind, NavigationState } from "@/lib/nuresq/types";

const AUTO_RECENTER_MS = 12_000;

export function useNavigationState() {
  const [state, dispatch] = useReducer(navigationStateReducer, "ROUTE_PREVIEW" as NavigationState);
  const autoRecenterTimer = useRef<number | null>(null);

  const clearAutoRecenter = useCallback(() => {
    if (autoRecenterTimer.current !== null) window.clearTimeout(autoRecenterTimer.current);
    autoRecenterTimer.current = null;
  }, []);

  const userGesture = useCallback((gesture: NavigationGestureKind = "pan") => {
    clearAutoRecenter();
    dispatch({ type: "USER_GESTURE", gesture });
    autoRecenterTimer.current = window.setTimeout(() => dispatch({ type: "RECENTER" }), AUTO_RECENTER_MS);
  }, [clearAutoRecenter]);

  const recenter = useCallback(() => {
    clearAutoRecenter();
    dispatch({ type: "RECENTER" });
  }, [clearAutoRecenter]);

  /** Called when a hazard/detail is being read; auto camera movement must not interrupt it. */
  const holdFreePan = useCallback(() => {
    clearAutoRecenter();
  }, [clearAutoRecenter]);

  useEffect(() => clearAutoRecenter, [clearAutoRecenter]);

  return useMemo(
    () => ({ state, dispatch, userGesture, recenter, holdFreePan, clearAutoRecenter }),
    [clearAutoRecenter, holdFreePan, recenter, state, userGesture],
  );
}
