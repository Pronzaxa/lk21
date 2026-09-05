"use client";

import {
  AlertTriangle,
  Compass,
  Layers3,
  LoaderCircle,
  LocateFixed,
  Minus,
  Plus,
  Route,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  StyleSpecification,
} from "maplibre-gl";
import { NavigationRenderLoop } from "./navigation/NavigationRenderLoop";
import { NavigationMapControls } from "./navigation/NavigationMapControls";
import { MAP_DEFAULT_CENTER } from "@/lib/nuresq/location";
import { tactileSpring } from "@/lib/nuresq/motion";
import { pointDistanceFromRoute } from "@/lib/nuresq/navigation";
import type {
  Destination,
  LiveHazardAlert,
  LocationSnapshot,
  ManeuverKind,
  MapRouteSummary,
  NavigationCameraMode,
  NavigationProgress,
  NavigationState,
  NavigationGestureKind,
  NetworkMode,
  TravelMode,
} from "@/lib/nuresq/types";

type FilterId = "semua" | "shelter" | "hospital" | "post" | "hazard";
type MapStatus = "loading" | "ready" | "fallback";
type Coordinate = [number, number];
type MapLibreModule = typeof import("maplibre-gl");
type MapProvider = "carto" | "osm";

interface SafetyMapProps {
  selected: Destination;
  onSelect: (destination: Destination) => void;
  destinations: Destination[];
  userLocation?: LocationSnapshot | null;
  visualNavigationLocation?: Coordinate | null;
  onRequestLocation?: () => void;
  routeSummary?: MapRouteSummary | null;
  routeActive?: boolean;
  liveHazards?: LiveHazardAlert[];
  compact?: boolean;
  travelMode?: TravelMode;
  navigationState?: NavigationState;
  cameraMode?: NavigationCameraMode;
  navigationProgress?: NavigationProgress | null;
  maneuverDistanceMeters?: number | null;
  networkMode?: NetworkMode;
  onSelectAlternative?: (index: number) => void;
  onUserGesture?: (gesture?: NavigationGestureKind) => void;
  onRecenter?: () => void;
  onOverview?: () => void;
  onNorthUp?: () => void;
  onRecenterComplete?: () => void;
  onInteractionHold?: () => void;
  navigationTopInset?: number;
  navigationBottomInset?: number;
  upcomingManeuverCoordinate?: Coordinate | null;
  upcomingManeuverKind?: ManeuverKind | null;
}

const MAP_LOAD_TIMEOUT_MS = 2_800;

function supportsWebGL2() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: true }));
  } catch {
    return false;
  }
}

function styleKey(theme: string | undefined, detailed: boolean, provider: MapProvider) {
  return `${provider}-${theme === "light" ? "light" : "dark"}-${detailed ? "detail" : "standard"}`;
}

function rasterMapStyle(
  theme: string | undefined,
  detailed: boolean,
  provider: MapProvider,
): StyleSpecification {
  const isLight = theme === "light";
  const cartoTheme = isLight ? (detailed ? "rastertiles/voyager" : "light_all") : "dark_all";
  const tiles = provider === "carto"
    ? ["a", "b", "c", "d"].map(
        (subdomain) => `https://${subdomain}.basemaps.cartocdn.com/${cartoTheme}/{z}/{x}/{y}@2x.png`,
      )
    : ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"];

  return {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        tiles,
        tileSize: 256,
        maxzoom: 20,
        attribution: provider === "carto"
          ? "© OpenStreetMap contributors © CARTO"
          : "© OpenStreetMap contributors",
      },
    },
    layers: [
      {
        id: "nuresq-basemap",
        type: "raster",
        source: "basemap",
        paint: provider === "osm" && !isLight
          ? {
              "raster-brightness-min": 0.04,
              "raster-brightness-max": 0.58,
              "raster-contrast": 0.26,
              "raster-saturation": -0.72,
            }
          : {
              "raster-contrast": detailed ? 0.08 : 0,
              "raster-saturation": isLight ? -0.08 : -0.18,
            },
      },
    ],
  };
}

function routeFeature(coordinates: Coordinate[]) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates,
    },
  };
}

function routeCollection(routes: Array<{ index: number; coordinates: Coordinate[] }>) {
  return {
    type: "FeatureCollection" as const,
    features: routes.map((route) => ({
      ...routeFeature(route.coordinates),
      properties: { index: route.index },
    })),
  };
}

function accuracyCircleFeature(center: Coordinate, radiusMeters: number) {
  const latitudeRadians = center[1] * Math.PI / 180;
  const points = Array.from({ length: 49 }, (_, index) => {
    const angle = index / 48 * Math.PI * 2;
    const latitudeOffset = Math.sin(angle) * radiusMeters / 110_540;
    const longitudeOffset = Math.cos(angle) * radiusMeters / (111_320 * Math.cos(latitudeRadians));
    return [center[0] + longitudeOffset, center[1] + latitudeOffset] as Coordinate;
  });
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "Polygon" as const, coordinates: [points] },
  };
}

function emptyFeatureCollection() {
  return { type: "FeatureCollection" as const, features: [] };
}

function makeUserPuckElement() {
  const element = document.createElement("div");
  element.className = "navigation-user-puck trusted";
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", "Lokasi navigasi perangkat");
  element.innerHTML = '<span class="navigation-puck-bearing" aria-hidden="true"><i></i></span><span class="navigation-puck-core" aria-hidden="true"></span>';
  return element;
}

function makeMarkerElement({
  className,
  glyph,
  label,
  onClick,
}: {
  className: string;
  glyph: string;
  label: string;
  onClick?: () => void;
}) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = className;
  element.setAttribute("aria-label", label);
  element.innerHTML = `<span class="real-marker-pin" aria-hidden="true"><i class="real-marker-glyph">${glyph}</i></span><span class="real-marker-label">${label}</span>`;
  if (onClick) element.addEventListener("click", onClick);
  return element;
}

function removeMarkerSafely(marker: MapLibreMarker | null | undefined) {
  try {
    marker?.remove();
  } catch {
    // MapLibre can already have detached its WebGL resources during a
    // compatibility fallback; cleanup must remain idempotent.
  }
}

function removeMapSafely(map: MapLibreMap | null | undefined) {
  try {
    map?.remove();
  } catch {
    // A partially initialized WebGL context has nothing left to destroy.
  }
}

function lngLatToWorld(longitude: number, latitude: number, zoom: number): Coordinate {
  const size = 256 * 2 ** zoom;
  const clampedLatitude = Math.max(-85.0511, Math.min(85.0511, latitude));
  const sine = Math.sin(clampedLatitude * Math.PI / 180);
  return [
    (longitude + 180) / 360 * size,
    (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * size,
  ];
}

function worldToLngLat(x: number, y: number, zoom: number): Coordinate {
  const size = 256 * 2 ** zoom;
  const longitude = x / size * 360 - 180;
  const normalizedY = 0.5 - y / size;
  const latitude = 90 - 360 * Math.atan(Math.exp(-normalizedY * 2 * Math.PI)) / Math.PI;
  return [longitude, latitude];
}

function RasterFallbackMap({
  origin,
  selected,
  destinations,
  hazards: fallbackHazards,
  routeCoordinates,
  navigationProgress,
  directionOnly,
  routeActive,
  followLocation,
  heading,
  compact,
  theme,
  onSelect,
  onHazard,
  onRequestLocation,
  hasUserLocation,
  onUserGesture,
  onRecenter,
}: {
  origin: Coordinate;
  selected: Destination;
  destinations: Destination[];
  hazards: LiveHazardAlert[];
  routeCoordinates: Coordinate[];
  navigationProgress: NavigationProgress | null;
  directionOnly: boolean;
  routeActive: boolean;
  followLocation: boolean;
  heading: number | null;
  compact: boolean;
  theme: string | undefined;
  onSelect: (destination: Destination) => void;
  onHazard: (id: string) => void;
  onRequestLocation?: () => void;
  hasUserLocation: boolean;
  onUserGesture?: (gesture?: NavigationGestureKind) => void;
  onRecenter?: () => void;
}) {
  const [zoom, setZoom] = useState(compact ? 13 : 14);
  const [center, setCenter] = useState<Coordinate>(origin);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; world: Coordinate } | null>(null);
  const centerWorld = useMemo(() => lngLatToWorld(center[0], center[1], zoom), [center, zoom]);

  useEffect(() => {
    if (!followLocation) return;
    const timer = window.setTimeout(() => setCenter(origin), 0);
    return () => window.clearTimeout(timer);
  }, [followLocation, origin]);
  const tileCount = 2 ** zoom;
  const centerTileX = Math.floor(centerWorld[0] / 256);
  const centerTileY = Math.floor(centerWorld[1] / 256);
  const tiles = useMemo(() => {
    const output: Array<{ key: string; x: number; y: number; left: number; top: number }> = [];
    for (let deltaY = -3; deltaY <= 3; deltaY += 1) {
      for (let deltaX = -3; deltaX <= 3; deltaX += 1) {
        const rawX = centerTileX + deltaX;
        const rawY = centerTileY + deltaY;
        if (rawY < 0 || rawY >= tileCount) continue;
        const x = ((rawX % tileCount) + tileCount) % tileCount;
        output.push({
          key: `${zoom}-${rawX}-${rawY}`,
          x,
          y: rawY,
          left: rawX * 256 - centerWorld[0],
          top: rawY * 256 - centerWorld[1],
        });
      }
    }
    return output;
  }, [centerTileX, centerTileY, centerWorld, tileCount, zoom]);

  const projected = (longitude: number, latitude: number) => {
    const world = lngLatToWorld(longitude, latitude, zoom);
    return { x: world[0] - centerWorld[0], y: world[1] - centerWorld[1] };
  };

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button, a")) return;
    if (routeActive) onUserGesture?.();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, world: centerWorld };
  };
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const nextWorldX = drag.world[0] - (event.clientX - drag.x);
    const nextWorldY = drag.world[1] - (event.clientY - drag.y);
    setCenter(worldToLngLat(nextWorldX, nextWorldY, zoom));
  };
  const pointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const resetCenter = () => {
    setCenter(origin);
    if (routeActive) onRecenter?.();
    else onRequestLocation?.();
  };
  const projectLine = (coordinates: Coordinate[]) => coordinates.map((coordinate) => {
    const point = projected(coordinate[0], coordinate[1]);
    return `${point.x},${point.y}`;
  }).join(" ");
  const routePoints = projectLine(routeCoordinates);
  const travelledPoints = projectLine(navigationProgress?.travelledCoordinates ?? []);
  const remainingPoints = projectLine(navigationProgress?.remainingCoordinates ?? routeCoordinates);

  return (
    <div
      className={`raster-fallback-map ${theme === "light" ? "light-tiles" : "dark-tiles"}`}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerEnd}
      onPointerCancel={pointerEnd}
      aria-label="OpenStreetMap raster interaktif tanpa WebGL"
    >
      <div className="raster-tile-layer" aria-hidden="true">
        {tiles.map((tile) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={tile.key}
            src={`https://tile.openstreetmap.org/${zoom}/${tile.x}/${tile.y}.png`}
            alt=""
            draggable={false}
            style={{ left: `calc(50% + ${tile.left}px)`, top: `calc(50% + ${tile.top}px)` }}
          />
        ))}
      </div>

      {routeCoordinates.length > 1 && (
        <svg className={`raster-route-layer ${directionOnly ? "direction-only" : ""}`} aria-hidden="true">
          <polyline className="route-casing" points={routePoints} />
          {routeActive && navigationProgress && !directionOnly && <polyline className="route-travelled" points={travelledPoints} />}
          <polyline className="route-remaining" points={remainingPoints} />
        </svg>
      )}

      {fallbackHazards.map((hazard) => {
        const point = projected(hazard.longitude!, hazard.latitude!);
        return (
          <button
            type="button"
            key={hazard.id}
            className={`raster-marker raster-hazard ${hazard.severity}`}
            style={{ left: `calc(50% + ${point.x}px)`, top: `calc(50% + ${point.y}px)` }}
            onClick={() => onHazard(hazard.id)}
            aria-label={hazard.title}
          >!</button>
        );
      })}

      {destinations.map((destination) => {
        const point = projected(destination.longitude, destination.latitude);
        const glyph = destination.kind === "hospital" ? "H" : destination.kind === "shelter" ? "S" : "P";
        return (
          <button
            type="button"
            key={destination.id}
            className={`raster-marker raster-destination ${destination.kind} ${selected.id === destination.id ? "selected" : ""}`}
            style={{ left: `calc(50% + ${point.x}px)`, top: `calc(50% + ${point.y}px)` }}
            onClick={() => onSelect(destination)}
            aria-label={destination.name}
          >{glyph}</button>
        );
      })}

      {hasUserLocation && (() => {
        const point = projected(origin[0], origin[1]);
        return <span className={`raster-marker raster-user ${heading === null ? "dot" : "heading"}`} style={{ left: `calc(50% + ${point.x}px)`, top: `calc(50% + ${point.y}px)`, "--puck-bearing": `${heading ?? 0}deg` } as CSSProperties} aria-label="Lokasi Anda" />;
      })()}
      {!compact && (
        <div className="raster-controls">
          <button type="button" onClick={() => setZoom((current) => Math.min(18, current + 1))} aria-label="Perbesar peta raster"><Plus /></button>
          <button type="button" onClick={() => setZoom((current) => Math.max(5, current - 1))} aria-label="Perkecil peta raster"><Minus /></button>
          <button type="button" onClick={resetCenter} aria-label="Pusatkan peta raster ke lokasi"><LocateFixed /></button>
        </div>
      )}
      <a className="raster-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>
    </div>
  );
}

export function SafetyMap({
  selected,
  onSelect,
  destinations,
  userLocation,
  visualNavigationLocation = null,
  onRequestLocation,
  routeSummary = null,
  routeActive = false,
  liveHazards = [],
  compact = false,
  travelMode = "walking",
  navigationState = "ROUTE_PREVIEW",
  cameraMode = "FOLLOW",
  navigationProgress = null,
  maneuverDistanceMeters = null,
  networkMode = "online",
  onSelectAlternative,
  onUserGesture,
  onRecenter,
  onOverview,
  onNorthUp,
  onRecenterComplete,
  onInteractionHold,
  navigationTopInset = 118,
  navigationBottomInset = 154,
  upcomingManeuverCoordinate = null,
  upcomingManeuverKind = null,
}: SafetyMapProps) {
  const reduceMotion = useReducedMotion();
  const { resolvedTheme } = useTheme();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const mapLibraryRef = useRef<MapLibreModule | null>(null);
  const markersRef = useRef<MapLibreMarker[]>([]);
  const userPuckRef = useRef<MapLibreMarker | null>(null);
  const maneuverMarkerRef = useRef<MapLibreMarker | null>(null);
  const userPuckElementRef = useRef<HTMLElement | null>(null);
  const [userPuckInstance, setUserPuckInstance] = useState<MapLibreMarker | null>(null);
  const [userPuckElement, setUserPuckElement] = useState<HTMLElement | null>(null);
  const onUserGestureRef = useRef(onUserGesture);
  const currentStyleRef = useRef("");
  const mapProviderRef = useRef<MapProvider>("osm");
  const mapLoadTimerRef = useRef<number | undefined>(undefined);
  const activateMapFallbackRef = useRef<(() => void) | null>(null);
  const [filter, setFilter] = useState<FilterId>("semua");
  const [detailedStyle, setDetailedStyle] = useState(false);
  const [activeHazard, setActiveHazard] = useState<string | null>(null);
  const [mapStatus, setMapStatus] = useState<MapStatus>("loading");
  const [mapReady, setMapReady] = useState(false);
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);
  const [styleRevision, setStyleRevision] = useState(0);
  const [mapBearing, setMapBearing] = useState(0);

  const routeCoordinates = useMemo(() => routeSummary?.coordinates ?? [], [routeSummary]);
  const routeStatus = routeSummary?.mode ?? "idle";

  useEffect(() => {
    onUserGestureRef.current = onUserGesture;
  }, [onUserGesture]);

  const origin = useMemo<Coordinate>(() => [
    userLocation?.longitude ?? MAP_DEFAULT_CENTER.longitude,
    userLocation?.latitude ?? MAP_DEFAULT_CENTER.latitude,
  ], [userLocation?.latitude, userLocation?.longitude]);
  const visualOrigin = visualNavigationLocation ?? origin;

  const visibleDestinations = useMemo(
    () => destinations.filter((item) => filter === "semua" || item.kind === filter),
    [destinations, filter],
  );
  const mappedHazards = useMemo(
    () => liveHazards.filter((alert) => Number.isFinite(alert.latitude) && Number.isFinite(alert.longitude)),
    [liveHazards],
  );
  const displayHazards = useMemo(() => {
    if (!routeActive || routeCoordinates.length < 2) return mappedHazards;
    const remainingRoute = navigationProgress?.remainingCoordinates ?? routeCoordinates;
    return mappedHazards.filter((hazard) => pointDistanceFromRoute([hazard.longitude!, hazard.latitude!], remainingRoute) <= 850);
  }, [mappedHazards, navigationProgress?.remainingCoordinates, routeActive, routeCoordinates]);
  const activeHazardData = mappedHazards.find((hazard) => hazard.id === activeHazard) ?? null;

  useEffect(() => {
    if (!mapContainerRef.current) return;
    let cancelled = false;
    let map: MapLibreMap | null = null;
    let styleUsable = false;
    let tileErrorCount = 0;

    function clearLoadTimeout() {
      if (mapLoadTimerRef.current) window.clearTimeout(mapLoadTimerRef.current);
      mapLoadTimerRef.current = undefined;
    }

    function applyFallback() {
      if (cancelled || !map) return;
      if (mapProviderRef.current === "osm") {
        clearLoadTimeout();
        setMapStatus("fallback");
        setMapReady(false);
        return;
      }

      mapProviderRef.current = "osm";
      styleUsable = false;
      tileErrorCount = 0;
      currentStyleRef.current = styleKey(resolvedTheme, detailedStyle, "osm");
      setMapStatus("loading");
      try {
        map.setStyle(rasterMapStyle(resolvedTheme, detailedStyle, "osm"));
        armLoadTimeout();
      } catch {
        setMapStatus("fallback");
      }
    }

    function armLoadTimeout() {
      clearLoadTimeout();
      mapLoadTimerRef.current = window.setTimeout(() => {
        if (mapProviderRef.current === "carto") applyFallback();
        else setMapStatus("fallback");
      }, MAP_LOAD_TIMEOUT_MS);
    }

    activateMapFallbackRef.current = applyFallback;

    if (!supportsWebGL2()) {
      const fallbackTimer = window.setTimeout(() => {
        if (cancelled) return;
        setMapStatus("fallback");
        setMapReady(false);
      }, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(fallbackTimer);
        clearLoadTimeout();
        activateMapFallbackRef.current = null;
      };
    }

    void import("maplibre-gl").then((maplibre) => {
      if (cancelled || !mapContainerRef.current) return;
      mapLibraryRef.current = maplibre;
      mapProviderRef.current = "osm";
      currentStyleRef.current = styleKey(resolvedTheme ?? "dark", detailedStyle, "osm");
      try {
        map = new maplibre.Map({
          container: mapContainerRef.current,
          style: rasterMapStyle(resolvedTheme ?? "dark", detailedStyle, "osm"),
          center: origin,
          zoom: compact ? 12.7 : 13.4,
          minZoom: 4,
          maxZoom: 19,
          attributionControl: false,
          interactive: !compact,
          dragRotate: !compact,
          pitchWithRotate: !compact,
          cooperativeGestures: false,
        });
      } catch {
        setMapStatus("fallback");
        return;
      }
      if (!map) return;
      mapRef.current = map;
      setMapInstance(map);
      map.addControl(new maplibre.AttributionControl({ compact: false }), "bottom-left");
      const handlePanGesture = () => onUserGestureRef.current?.("pan");
      const handleZoomGesture = (event: unknown) => {
        if ((event as { originalEvent?: unknown }).originalEvent) onUserGestureRef.current?.("zoom");
      };
      const handleRotateGesture = (event: unknown) => {
        if ((event as { originalEvent?: unknown }).originalEvent) onUserGestureRef.current?.("rotate");
      };
      map.on("dragstart", handlePanGesture);
      map.on("zoomstart", handleZoomGesture);
      map.on("rotatestart", handleRotateGesture);
      map.on("rotateend", () => setMapBearing(map?.getBearing() ?? 0));
      const markMapReady = () => {
        if (cancelled) return;
        styleUsable = true;
        tileErrorCount = 0;
        clearLoadTimeout();
        setMapStatus("ready");
        setMapReady(true);
        setStyleRevision((current) => current + 1);
      };
      map.on("style.load", markMapReady);
      map.on("load", markMapReady);
      map.once("render", () => {
        if (map?.isStyleLoaded()) markMapReady();
      });
      map.on("error", () => {
        if (cancelled) return;
        tileErrorCount += 1;
        if (!styleUsable) {
          applyFallback();
          return;
        }
        if (mapProviderRef.current === "carto" && tileErrorCount >= 3) {
          applyFallback();
          return;
        }
        if (mapProviderRef.current === "osm" && tileErrorCount >= 6) setMapStatus("fallback");
      });
      armLoadTimeout();
    }).catch(() => {
      if (!cancelled) setMapStatus("fallback");
    });

    return () => {
      cancelled = true;
      clearLoadTimeout();
      activateMapFallbackRef.current = null;
      markersRef.current.forEach(removeMarkerSafely);
      markersRef.current = [];
      removeMarkerSafely(userPuckRef.current);
      userPuckRef.current = null;
      removeMarkerSafely(maneuverMarkerRef.current);
      maneuverMarkerRef.current = null;
      userPuckElementRef.current = null;
      removeMapSafely(map);
      mapRef.current = null;
    };
    // MapLibre owns its canvas after mount; following state changes are synchronized below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const provider = mapProviderRef.current;
    const nextKey = styleKey(resolvedTheme, detailedStyle, provider);
    if (currentStyleRef.current === nextKey) return;
    currentStyleRef.current = nextKey;
    const loadingTimer = window.setTimeout(() => setMapStatus("loading"), 0);
    if (mapLoadTimerRef.current) window.clearTimeout(mapLoadTimerRef.current);
    mapLoadTimerRef.current = window.setTimeout(() => {
      if (provider === "carto") activateMapFallbackRef.current?.();
      else setMapStatus("fallback");
    }, MAP_LOAD_TIMEOUT_MS);

    try {
      map.setStyle(rasterMapStyle(resolvedTheme, detailedStyle, provider));
    } catch {
      window.clearTimeout(loadingTimer);
      window.setTimeout(() => setMapStatus("fallback"), 0);
    }
    return () => {
      window.clearTimeout(loadingTimer);
    };
  }, [detailedStyle, mapReady, resolvedTheme]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibre = mapLibraryRef.current;
    if (!mapReady || !map || !maplibre) return;

    markersRef.current.forEach(removeMarkerSafely);
    markersRef.current = [];

    if (filter === "semua" || filter === "hazard") {
      displayHazards.forEach((hazard) => {
        const marker = new maplibre.Marker({
          element: makeMarkerElement({
            className: `real-map-marker hazard-real-marker ${hazard.severity} ${activeHazard === hazard.id ? "selected" : ""}`,
            glyph: "!",
            label: hazard.title,
            onClick: () => setActiveHazard((current) => current === hazard.id ? null : hazard.id),
          }),
          anchor: "bottom",
        }).setLngLat([hazard.longitude!, hazard.latitude!]).addTo(map);
        markersRef.current.push(marker);
      });
    }

    visibleDestinations.forEach((destination) => {
      const glyph = destination.kind === "hospital" ? "H" : destination.kind === "shelter" ? "S" : "P";
      const marker = new maplibre.Marker({
        element: makeMarkerElement({
          className: `real-map-marker destination-real-marker ${destination.kind} ${selected.id === destination.id ? "selected" : ""}`,
          glyph,
          label: destination.name,
          onClick: () => onSelect(destination),
        }),
        anchor: "bottom",
      }).setLngLat([destination.longitude, destination.latitude]).addTo(map);
      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach(removeMarkerSafely);
      markersRef.current = [];
    };
  }, [activeHazard, displayHazards, filter, mapReady, onSelect, selected.id, visibleDestinations]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !map.isStyleLoaded()) return;
    const sourceId = "nuresq-hazard-zones";
    const layerId = "nuresq-hazard-zones-fill";
    const zoneData = {
      type: "FeatureCollection" as const,
      features: displayHazards.map((hazard) => ({
        ...accuracyCircleFeature(
          [hazard.longitude!, hazard.latitude!],
          hazard.severity === "critical" ? 240 : hazard.severity === "warning" ? 180 : 120,
        ),
        properties: { severity: hazard.severity },
      })),
    };
    const source = map.getSource(sourceId) as GeoJSONSource | undefined;
    if (source) source.setData(zoneData);
    else map.addSource(sourceId, { type: "geojson", data: zoneData });
    if (!map.getLayer(layerId)) {
      map.addLayer({
        id: layerId,
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": ["match", ["get", "severity"], "critical", "#f04f4f", "warning", "#ff9e43", "#ffd91a"],
          "fill-opacity": ["match", ["get", "severity"], "critical", 0.15, "warning", 0.12, 0.08],
          "fill-outline-color": ["match", ["get", "severity"], "critical", "rgba(240,79,79,.5)", "warning", "rgba(255,158,67,.45)", "rgba(255,217,26,.35)"],
        },
      });
    }
  }, [displayHazards, mapReady, styleRevision]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibre = mapLibraryRef.current;
    if (!mapReady || !map || !maplibre || !map.isStyleLoaded()) return;
    const accuracySourceId = "nuresq-user-accuracy";
    const accuracyLayerId = "nuresq-user-accuracy-fill";
    const accuracySource = map.getSource(accuracySourceId) as GeoJSONSource | undefined;

    if (!userLocation) {
      removeMarkerSafely(userPuckRef.current);
      userPuckRef.current = null;
      userPuckElementRef.current = null;
      setUserPuckInstance(null);
      setUserPuckElement(null);
      accuracySource?.setData(emptyFeatureCollection());
      return;
    }

    const accuracy = userLocation.accuracy ?? 0;
    const showAccuracy = userLocation.mode === "GPS_LOW_ACCURACY" || userLocation.mode === "GPS_SUSPICIOUS" || accuracy > 32;
    const accuracyData = showAccuracy ? accuracyCircleFeature(origin, Math.max(accuracy, 24)) : emptyFeatureCollection();
    if (accuracySource) accuracySource.setData(accuracyData);
    else map.addSource(accuracySourceId, { type: "geojson", data: accuracyData });
    if (!map.getLayer(accuracyLayerId)) {
      map.addLayer({
        id: accuracyLayerId, type: "fill", source: accuracySourceId,
        paint: { "fill-color": "#ffd91a", "fill-opacity": 0.11, "fill-outline-color": "rgba(255,217,26,.38)" },
      });
    }

    if (!userPuckRef.current) {
      const element = makeUserPuckElement();
      userPuckElementRef.current = element;
      const marker = new maplibre.Marker({ element, anchor: "center" }).setLngLat(visualOrigin).addTo(map);
      userPuckRef.current = marker;
      setUserPuckInstance(marker);
      setUserPuckElement(element);
    }

    const element = userPuckElementRef.current;
    if (!element) return;
    const stale = userLocation.mode === "GPS_STALE" || userLocation.freshness === "STALE" || userLocation.freshness === "VERY_STALE";
    const suspicious = userLocation.mode === "GPS_SUSPICIOUS";
    const lowAccuracy = userLocation.mode === "GPS_LOW_ACCURACY";
    element.className = `navigation-user-puck ${stale ? "stale" : suspicious ? "suspicious" : lowAccuracy ? "low-accuracy" : "trusted"} ${routeActive ? "navigation-active" : ""}`;
    element.setAttribute("aria-label", stale ? "Lokasi terakhir, GPS sudah lama" : suspicious ? "Lokasi GPS mencurigakan" : lowAccuracy ? "Lokasi GPS dengan akurasi rendah" : "Lokasi GPS terverifikasi");
    const hasStableHeading = Number.isFinite(userLocation.heading) && (userLocation.speed ?? 0) > (travelMode === "walking" ? 0.55 : 1.8);
    element.classList.toggle("has-heading", hasStableHeading);
  }, [mapReady, origin, routeActive, styleRevision, travelMode, userLocation, visualOrigin]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !userLocation || routeActive) return;
    map.easeTo({ center: origin, zoom: Math.max(map.getZoom(), 14.5), duration: reduceMotion ? 0 : 520 });
  }, [mapReady, origin, reduceMotion, routeActive, userLocation]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibre = mapLibraryRef.current;
    removeMarkerSafely(maneuverMarkerRef.current);
    maneuverMarkerRef.current = null;
    if (!mapReady || !map || !maplibre || !routeActive || !upcomingManeuverCoordinate || !upcomingManeuverKind) return;
    const glyph = upcomingManeuverKind.includes("left") ? "↰"
      : upcomingManeuverKind.includes("right") ? "↱"
        : upcomingManeuverKind === "u-turn" ? "↶"
          : upcomingManeuverKind === "destination" ? "●"
            : "↑";
    const element = document.createElement("div");
    element.className = "navigation-maneuver-marker";
    element.textContent = glyph;
    element.setAttribute("aria-hidden", "true");
    maneuverMarkerRef.current = new maplibre.Marker({ element, anchor: "center" })
      .setLngLat(upcomingManeuverCoordinate)
      .addTo(map);
    return () => {
      removeMarkerSafely(maneuverMarkerRef.current);
      maneuverMarkerRef.current = null;
    };
  }, [mapReady, routeActive, upcomingManeuverCoordinate, upcomingManeuverKind]);

  useEffect(() => {
    const map = mapRef.current;
    const maplibre = mapLibraryRef.current;
    if (!mapReady || !map || !maplibre || !map.isStyleLoaded() || !routeSummary || routeCoordinates.length < 2) return;

    const sourceId = "nuresq-route-selected";
    const casingId = "nuresq-route-casing";
    const lineId = "nuresq-route-base";
    const alternativesSourceId = "nuresq-route-alternatives";
    const alternativesLayerId = "nuresq-route-alternatives-line";
    const alternatives = routeSummary.alternatives
      .map((route, index) => ({ index, coordinates: route.coordinates, id: route.id }))
      .filter((route) => route.id !== routeSummary.id);
    const alternativesData = routeCollection(alternatives);

    const selectedSource = map.getSource(sourceId) as GeoJSONSource | undefined;
    if (selectedSource) selectedSource.setData(routeFeature(routeCoordinates));
    else map.addSource(sourceId, { type: "geojson", data: routeFeature(routeCoordinates), lineMetrics: true });
    const alternativesSource = map.getSource(alternativesSourceId) as GeoJSONSource | undefined;
    if (alternativesSource) alternativesSource.setData(alternativesData);
    else map.addSource(alternativesSourceId, { type: "geojson", data: alternativesData });

    if (!map.getLayer(alternativesLayerId)) {
      map.addLayer({
        id: alternativesLayerId,
        type: "line",
        source: alternativesSourceId,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#87939c", "line-width": 4, "line-opacity": 0.48 },
      });
    }
    if (!map.getLayer(casingId)) {
      map.addLayer({
        id: casingId,
        type: "line",
        source: sourceId,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": resolvedTheme === "light" ? "#ffffff" : "#0b1116",
          "line-width": routeActive ? 10 : 8,
          "line-opacity": navigationState === "REROUTING" ? 0.34 : 0.94,
        },
      });
    }
    if (!map.getLayer(lineId)) {
      map.addLayer({
        id: lineId,
        type: "line",
        source: sourceId,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#ffd91a",
          "line-width": routeActive ? 6 : 5,
          "line-opacity": routeStatus === "direction" ? 0.86 : routeActive ? 0.22 : 0.96,
          "line-dasharray": routeStatus === "direction" ? [2, 2] : [1, 0],
        },
      });
    }

    map.setPaintProperty(alternativesLayerId, "line-opacity", routeActive ? 0 : 0.48);
    map.setPaintProperty(casingId, "line-width", routeActive ? 10 : 8);
    map.setPaintProperty(casingId, "line-color", resolvedTheme === "light" ? "#ffffff" : "#0b1116");
    map.setPaintProperty(casingId, "line-opacity", navigationState === "REROUTING" ? 0.34 : 0.94);
    map.setPaintProperty(lineId, "line-width", routeActive ? 6 : 5);
    map.setPaintProperty(lineId, "line-opacity", navigationState === "REROUTING" ? 0.25 : routeStatus === "direction" ? 0.86 : routeActive ? 0.22 : 0.96);
    map.setPaintProperty(lineId, "line-dasharray", routeStatus === "direction" ? [2, 2] : [1, 0]);

    if (!routeActive || compact) {
      const bounds = new maplibre.LngLatBounds(routeCoordinates[0], routeCoordinates[0]);
      routeCoordinates.forEach((coordinate) => bounds.extend(coordinate));
      map.fitBounds(bounds, {
        padding: compact ? 28 : { top: 88, right: 72, bottom: 190, left: 64 },
        maxZoom: compact ? 13.4 : 15.3,
        duration: reduceMotion ? 0 : 620,
      });
    }

    const handleAlternativeClick = (event: { features?: Array<{ properties?: { index?: number } }> }) => {
      const index = Number(event.features?.[0]?.properties?.index);
      if (!routeActive && Number.isInteger(index)) onSelectAlternative?.(index);
    };
    if (!routeActive) map.on("click", alternativesLayerId, handleAlternativeClick);

    if (routeActive || reduceMotion) {
      return () => {
        if (!routeActive) map.off("click", alternativesLayerId, handleAlternativeClick);
      };
    }
    const startedAt = performance.now();
    let animationFrame = 0;
    const animateRoute = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 720);
      const coordinateCount = Math.max(2, Math.ceil(routeCoordinates.length * progress));
      (map.getSource(sourceId) as GeoJSONSource | undefined)?.setData(routeFeature(routeCoordinates.slice(0, coordinateCount)));
      if (progress < 1) animationFrame = requestAnimationFrame(animateRoute);
      else (map.getSource(sourceId) as GeoJSONSource | undefined)?.setData(routeFeature(routeCoordinates));
    };
    animationFrame = requestAnimationFrame(animateRoute);
    return () => {
      cancelAnimationFrame(animationFrame);
      map.off("click", alternativesLayerId, handleAlternativeClick);
    };
  }, [compact, mapReady, navigationState, onSelectAlternative, reduceMotion, resolvedTheme, routeActive, routeCoordinates, routeStatus, routeSummary, styleRevision]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !map.isStyleLoaded() || !routeSummary) return;
    const travelledSourceId = "nuresq-route-travelled";
    const remainingSourceId = "nuresq-route-remaining";
    const travelledLayerId = "nuresq-route-travelled-line";
    const remainingLayerId = "nuresq-route-remaining-line";
    const showProgress = routeActive && routeSummary.mode === "road";
    const travelledData = showProgress && navigationProgress
      ? routeFeature(navigationProgress.travelledCoordinates)
      : emptyFeatureCollection();
    const remainingData = showProgress
      ? routeFeature(navigationProgress?.remainingCoordinates ?? routeSummary.coordinates)
      : emptyFeatureCollection();
    const travelledSource = map.getSource(travelledSourceId) as GeoJSONSource | undefined;
    const remainingSource = map.getSource(remainingSourceId) as GeoJSONSource | undefined;
    if (travelledSource) travelledSource.setData(travelledData);
    else map.addSource(travelledSourceId, { type: "geojson", data: travelledData });
    if (remainingSource) remainingSource.setData(remainingData);
    else map.addSource(remainingSourceId, { type: "geojson", data: remainingData });
    if (!map.getLayer(travelledLayerId)) {
      map.addLayer({
        id: travelledLayerId,
        type: "line",
        source: travelledSourceId,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#7a858d", "line-width": 5.5, "line-opacity": 0.3 },
      });
    }
    if (!map.getLayer(remainingLayerId)) {
      map.addLayer({
        id: remainingLayerId,
        type: "line",
        source: remainingSourceId,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffd91a", "line-width": 6, "line-opacity": 1 },
      });
    }
    map.setPaintProperty(remainingLayerId, "line-opacity", navigationState === "REROUTING" ? 0.36 : 1);
  }, [mapReady, navigationProgress, navigationState, routeActive, routeSummary, styleRevision]);

  const recenter = useCallback(() => {
    if (routeActive) onRecenter?.();
    else {
      onRequestLocation?.();
      mapRef.current?.easeTo({ center: origin, zoom: 15, bearing: 0, pitch: 0, duration: reduceMotion ? 0 : 520 });
    }
    navigator.vibrate?.(35);
  }, [onRecenter, onRequestLocation, origin, reduceMotion, routeActive]);

  const northUp = useCallback(() => {
    onNorthUp?.();
    mapRef.current?.easeTo({ bearing: 0, duration: reduceMotion ? 0 : 360 });
  }, [onNorthUp, reduceMotion]);

  const overview = useCallback(() => {
    onOverview?.();
  }, [onOverview]);

  const adjustZoom = (direction: 1 | -1) => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ zoom: map.getZoom() + direction, duration: reduceMotion ? 0 : 220 });
  };

  return (
    <section className={`safety-map real-map ${compact ? "compact" : ""}`} aria-label="Peta evakuasi OpenStreetMap interaktif">
      {!compact && !routeActive && (
        <div className="map-filters" aria-label="Filter peta">
          {[
            ["semua", "Semua"],
            ["shelter", "Area Terbuka"],
            ["hospital", "Rumah Sakit"],
            ["post", "Titik"],
            ["hazard", "Bahaya"],
          ].map(([id, label]) => (
            <button
              type="button"
              key={id}
              className={filter === id ? "active" : ""}
              onClick={() => setFilter(id as FilterId)}
              aria-pressed={filter === id}
            >
              {filter === id && <motion.span className="map-filter-active" layoutId="map-filter-active" transition={tactileSpring} />}
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="map-canvas real-map-canvas">
        <div ref={mapContainerRef} className="maplibre-host" />
        <NavigationRenderLoop
          map={mapInstance}
          mapReady={mapReady}
          puck={userPuckInstance}
          puckElement={userPuckElement}
          state={navigationState}
          cameraMode={cameraMode}
          location={userLocation ?? null}
          visualTarget={visualNavigationLocation ?? (userLocation ? origin : null)}
          remainingRoute={navigationProgress?.remainingCoordinates ?? routeCoordinates}
          travelMode={travelMode}
          maneuverDistanceMeters={maneuverDistanceMeters}
          topInset={routeActive ? navigationTopInset : 48}
          bottomInset={routeActive ? navigationBottomInset : 64}
          rightInset={routeActive ? 74 : 42}
          onRecenterComplete={onRecenterComplete}
        />
        {mapStatus !== "ready" && (
          <RasterFallbackMap
            key={`${origin[0]}-${origin[1]}-${compact ? "compact" : "full"}`}
            origin={visualOrigin}
            selected={selected}
            destinations={visibleDestinations}
            hazards={filter === "semua" || filter === "hazard" ? displayHazards : []}
            routeCoordinates={routeCoordinates}
            navigationProgress={navigationProgress}
            directionOnly={routeStatus === "direction"}
            routeActive={routeActive}
            followLocation={navigationState !== "FREE_PAN" && navigationState !== "FREE_ZOOM" && cameraMode !== "OVERVIEW"}
            heading={Number.isFinite(userLocation?.heading) ? userLocation!.heading! : null}
            compact={compact}
            theme={resolvedTheme}
            onSelect={onSelect}
            onHazard={(id) => setActiveHazard((current) => current === id ? null : id)}
            onRequestLocation={onRequestLocation}
            hasUserLocation={Boolean(userLocation)}
            onUserGesture={onUserGesture}
            onRecenter={onRecenter}
          />
        )}

        {mapStatus !== "ready" && (
          <div className={`map-live-badge ${mapStatus}`} role="status">
            {mapStatus === "loading" ? <LoaderCircle className="spin" /> : <Route />}
            <span>{mapStatus === "loading" ? "Memuat peta interaktif…" : networkMode === "offline" ? "Peta cache sebagian atau belum tersedia" : "Peta dasar aktif"}</span>
          </div>
        )}

        {!compact && routeActive && mapStatus !== "fallback" && (
          <NavigationMapControls
            detailed={detailedStyle}
            state={navigationState}
            cameraMode={cameraMode}
            compassVisible={Math.abs(mapBearing) > 2 || navigationState === "FOLLOWING_HEADING"}
            onToggleLayers={() => setDetailedStyle((current) => !current)}
            onNorthUp={northUp}
            onOverview={overview}
            onRecenter={recenter}
          />
        )}

        {!compact && !routeActive && mapStatus !== "fallback" && (
          <div className="map-controls" aria-label="Kontrol peta">
            <motion.button
              type="button"
              className={detailedStyle ? "active" : ""}
              whileTap={{ scale: 0.94 }}
              onClick={() => setDetailedStyle((current) => !current)}
              aria-label="Ubah gaya peta"
              aria-pressed={detailedStyle}
            >
              <Layers3 />
            </motion.button>
            <motion.button type="button" whileTap={{ scale: 0.94 }} onClick={() => adjustZoom(1)} aria-label="Perbesar peta"><Plus /></motion.button>
            <motion.button type="button" whileTap={{ scale: 0.94 }} onClick={() => adjustZoom(-1)} aria-label="Perkecil peta"><Minus /></motion.button>
            <motion.button type="button" whileTap={{ scale: 0.94 }} onClick={recenter} aria-label="Gunakan dan pusatkan lokasi GPS"><LocateFixed /></motion.button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={northUp}
              aria-label="Kembalikan arah utara"
            >
              <Compass />
            </motion.button>
          </div>
        )}

        {!compact && activeHazardData && (
          <motion.div className="hazard-map-note" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} onPointerDown={onInteractionHold}>
            <AlertTriangle />
            <span><strong>{activeHazardData.title}</strong>{activeHazardData.detail} · {activeHazardData.sourceName}</span>
            <button type="button" onClick={() => setActiveHazard(null)} aria-label="Tutup informasi bahaya">×</button>
          </motion.div>
        )}

      </div>
    </section>
  );
}
