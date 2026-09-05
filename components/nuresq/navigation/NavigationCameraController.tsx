/**
 * Camera planning moved to lib/nuresq/navigation-engine.ts and is executed by
 * NavigationRenderLoop.tsx. This file remains as an architecture signpost for
 * older imports; active navigation intentionally has only one requestAnimationFrame loop.
 */
export { NavigationCameraController } from "@/lib/nuresq/navigation-engine";
