import type { LucideIcon } from "lucide-react";

export type ViewId = "beranda" | "peta" | "sos" | "pesan" | "akun";

export type NetworkMode = "online" | "terbatas" | "offline";

export type ConnectivityState =
  | "CONNECTED"
  | "DEGRADED"
  | "BACKEND_UNREACHABLE"
  | "OFFLINE";

export type DeliveryStatus =
  | "DRAFT"
  | "LOCAL_SAVED"
  | "PENDING"
  | "SENDING"
  | "SENT"
  | "ACKNOWLEDGED"
  | "FAILED"
  | "RETRYING";

export type DeliveryCapability =
  | "LOCAL_ONLY"
  | "PENDING_DELIVERY"
  | "READY_TO_SHARE"
  | "DELIVERY_NOT_CONFIGURED";

export type IncidentType =
  | "Banjir"
  | "Gempa"
  | "Longsor"
  | "Kebakaran"
  | "Darurat Medis"
  | "Lainnya";

export interface Destination {
  id: string;
  name: string;
  kind: "shelter" | "hospital" | "post";
  latitude: number;
  longitude: number;
  distance: string;
  eta: string;
  capacity: string;
  safe: boolean;
  note: string;
}

export type NavigationState =
  | "ROUTE_PREVIEW"
  | "NAV_STARTING"
  | "FOLLOWING"
  | "FOLLOWING_HEADING"
  | "FREE_PAN"
  | "FREE_ZOOM"
  | "RECENTERING"
  | "ROUTE_OVERVIEW"
  | "OFF_ROUTE_PENDING"
  | "REROUTING"
  | "GPS_WEAK"
  | "GPS_STALE"
  | "NETWORK_DEGRADED"
  | "OFFLINE_ROUTE"
  | "DIRECTION_ONLY"
  | "ARRIVING"
  | "ARRIVED"
  | "ENDED";

/** Citizen-facing camera modes. Heading-up is an internal FOLLOW state. */
export type NavigationCameraMode = "FOLLOW" | "EXPLORE" | "OVERVIEW";

export type NavigationGestureKind = "pan" | "zoom" | "rotate" | "tilt";

export type NavigationGpsQuality = "good" | "weak" | "stale" | "suspicious";

export type NavigationRunMode = "REAL_NAVIGATION" | "DEMO_NAVIGATION";

export type ManeuverKind =
  | "straight"
  | "slight-left"
  | "left"
  | "sharp-left"
  | "slight-right"
  | "right"
  | "sharp-right"
  | "u-turn"
  | "roundabout"
  | "destination";

export interface NavigationManeuver {
  id: string;
  kind: ManeuverKind;
  instruction: string;
  streetName: string | null;
  distanceMeters: number;
  routeDistanceFromStart: number;
  coordinate: [number, number] | null;
}

export interface NavigationRouteOption {
  id: string;
  coordinates: Array<[number, number]>;
  distanceMeters: number;
  durationSeconds: number;
  distanceLabel: string;
  durationLabel: string;
  maneuvers: NavigationManeuver[];
}

export interface NavigationProgress {
  fraction: number;
  distanceFromRouteMeters: number;
  travelledDistanceMeters: number;
  remainingDistanceMeters: number;
  remainingDurationSeconds: number;
  visualCoordinate: [number, number];
  travelledCoordinates: Array<[number, number]>;
  remainingCoordinates: Array<[number, number]>;
}

export interface MapRouteSummary {
  id: string;
  coordinates: Array<[number, number]>;
  alternatives: NavigationRouteOption[];
  maneuvers: NavigationManeuver[];
  distanceMeters: number;
  durationSeconds: number;
  distanceLabel: string;
  durationLabel: string;
  nextInstruction: string;
  mode: "road" | "direction";
  travelMode: TravelMode;
  provider: "osrm-driving" | "direction-only";
  retrievedAt: string;
  freshness: DataFreshness;
}

export type TravelMode = "walking" | "driving";

export interface NavItem {
  id: ViewId;
  label: string;
  icon: LucideIcon;
}

export interface SosDraft {
  type: IncidentType | null;
  description: string;
  victimCount: number | null;
  mobilityLimited: boolean;
  waterLevel: number;
  injuryAssessment: InjuryAssessment | null;
}

export type InjuryPriority = "kritis" | "tinggi" | "pantau";

export interface InjuryRedFlags {
  uncontrolledBleeding: boolean;
  unconscious: boolean;
  breathingDifficulty: boolean;
  suspectedFracture: boolean;
}

export interface InjuryVisualCheck {
  brightness: number;
  contrast: number;
  redPixelRatio: number;
  quality: "cukup" | "ulang";
}

export interface InjuryAssessment {
  priority: InjuryPriority;
  redFlags: InjuryRedFlags;
  reasons: string[];
  guidance: string[];
  visual: InjuryVisualCheck;
  createdAt: string;
}

export type HazardKind =
  | "earthquake"
  | "flood"
  | "fire"
  | "weather"
  | "landslide"
  | "volcano"
  | "other";

export type HazardSeverity = "critical" | "warning" | "advisory";

export interface LiveHazardAlert {
  id: string;
  kind: HazardKind;
  severity: HazardSeverity;
  title: string;
  detail: string;
  advice: string;
  sourceName: string;
  sourceUrl: string;
  observedAt: string;
  expiresAt?: string;
  latitude?: number;
  longitude?: number;
  distanceKm?: number;
  confidence: "official" | "community" | "model";
  retrievedAt: string;
  freshness: DataFreshness;
}

export interface HazardSourceState {
  id: "bmkg-weather" | "bmkg-earthquake" | "petabencana";
  label: string;
  state: "available" | "unavailable" | "not-configured";
  retrievedAt?: string;
  freshness: DataFreshness;
  note?: string;
}

export interface LiveHazardFeed {
  status: "fresh" | "aging" | "stale" | "partial" | "unavailable";
  generatedAt: string;
  retrievedAt: string;
  freshness: DataFreshness;
  alerts: LiveHazardAlert[];
  sources: HazardSourceState[];
  locationLabel: string;
  regionId: string | null;
}

export type DataFreshness = "FRESH" | "AGING" | "STALE" | "UNKNOWN";

export type LocationFreshness = "FRESH" | "AGING" | "STALE" | "VERY_STALE";

export type LocationTrustMode =
  | "GPS_TRUSTED"
  | "GPS_LOW_ACCURACY"
  | "GPS_SUSPICIOUS"
  | "LAST_TRUSTED"
  | "GPS_UNAVAILABLE"
  | "GPS_STALE"
  | "GPS_REQUESTING";

export interface LocationSnapshot {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading?: number | null;
  speed?: number | null;
  updatedAt: number;
  mode: LocationTrustMode;
  label: string;
  freshness: LocationFreshness;
  ageMs: number;
}

export interface ActiveRegion {
  adm4: string;
  label: string;
  latitude?: number;
  longitude?: number;
}

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
}

export interface EmergencyIncident {
  incident_lifecycle?: "ACTIVE" | "RESOLVED" | "CANCELLED";
  closed_at?: string;
  incident_id: string;
  type: IncidentType | null;
  description: string;
  latitude: number | null;
  longitude: number | null;
  location_trust: LocationTrustMode | "UNAVAILABLE";
  location_accuracy_m: number | null;
  location_updated_at: string | null;
  victim_count: number | null;
  mobility: "terbatas" | "normal";
  risk_level: string;
  requested_help: string;
  injury_triage: {
    priority: InjuryPriority;
    red_flags: InjuryRedFlags;
    reasons: string[];
    photo_uploaded: false;
  } | null;
  timestamp: string;
  connectivity_state: ConnectivityState;
  delivery_status: DeliveryStatus;
  delivery_capability: DeliveryCapability;
  acknowledgement: {
    id: string;
    acknowledgedAt: string;
  } | null;
  last_delivery_attempt_at: string | null;
}
