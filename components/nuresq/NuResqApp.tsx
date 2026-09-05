"use client";

import {
  ChevronRight,
  CircleUserRound,
  Clock3,
  Cross,
  HardDrive,
  House,
  LocateFixed,
  Map,
  MapPin,
  Moon,
  Navigation,
  Radio,
  Route,
  ShieldCheck,
  Siren,
  Sparkles,
  MessageSquareText,
  Sun,
  Footprints,
  Car,
} from "lucide-react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion, type PanInfo } from "motion/react";
import { ThemeProvider, useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AccountView } from "./AccountView";
import { Brand } from "./Brand";
import { LiveRiskPanel } from "./LiveRiskPanel";
import { AssistantHubPage, type AssistantLaunchRequest } from "./assistant/AssistantHubPage";
import { SafetyMap } from "./SafetyMap";
import {
  ManeuverCard,
  NavigationNotice,
  RouteHazardWarning,
  TripProgressPanel,
} from "./navigation/NavigationOverlays";
import { SOSButton } from "./SOSButton";
import { SosFlow } from "./SosFlow";
import { StatusPill } from "./StatusPill";
import { useLiveHazards } from "@/hooks/useLiveHazards";
import { useNuresqPwa } from "@/hooks/useNuresqPwa";
import { useTrustedLocation } from "@/hooks/useTrustedLocation";
import { useConnectivity } from "@/hooks/useConnectivity";
import { useActiveRegion } from "@/hooks/useActiveRegion";
import { useNavigationRoute } from "@/hooks/useNavigationRoute";
import { useNavigationState } from "@/hooks/useNavigationState";
import { useNavigationTracking } from "@/hooks/useNavigationTracking";
import { EmergencyRepository } from "@/lib/nuresq/emergency-repository";
import { prepareLocalAI } from '@/lib/nuresq/ai/LocalAIManager';
import { freshnessCopy } from "@/lib/nuresq/freshness";
import { incidentStatusPresentation, priorityLabel, reportStateForIncident } from "@/lib/nuresq/incident-state";
import { ageCopy, locationTrustCopy, MAP_DEFAULT_CENTER } from "@/lib/nuresq/location";
import { destinations } from "@/lib/nuresq/mock-data";
import { motionDuration, motionEase, tactileSpring } from "@/lib/nuresq/motion";
import {
  arrivalState,
  currentManeuver,
  nearestRouteHazard,
  updateOffRouteTracker,
  type OffRouteTracker,
} from "@/lib/nuresq/navigation";
import { cameraModeForState, isNavigationActive } from "@/lib/nuresq/navigation-state";
import { RouteProgressTracker, type NavigationViewModel } from "@/lib/nuresq/navigation-engine";
import type {
  Destination,
  EmergencyIncident,
  LiveHazardAlert,
  LiveHazardFeed,
  LocationSnapshot,
  NavItem,
  NavigationRunMode,
  NetworkMode,
  TravelMode,
  ViewId,
} from "@/lib/nuresq/types";

type ReportState = "idle" | "queued" | "ready";

const navItems: NavItem[] = [
  { id: "beranda", label: "Beranda", icon: House },
  { id: "peta", label: "Peta", icon: Map },
  { id: "sos", label: "SOS", icon: Siren },
  { id: "pesan", label: "Pesan", icon: MessageSquareText },
  { id: "akun", label: "Akun", icon: CircleUserRound },
];

const viewTitles: Record<ViewId, string> = {
  beranda: "Beranda",
  peta: "Peta Evakuasi",
  sos: "SOS",
  pesan: "Pesan & Asisten",
  akun: "Akun",
};

export default function NuResqApp() {
  const reduceMotion = useReducedMotion();
  const { canInstall, install } = useNuresqPwa();
  const { report: connectivity, networkMode } = useConnectivity();
  const { region, setRegion } = useActiveRegion();
  const { location, requestState: locationRequestState, refresh: refreshLocation } = useTrustedLocation();
  const { feed: hazardFeed, state: hazardState, refresh: refreshHazards } = useLiveHazards(location, region);
  const [view, setView] = useState<ViewId>("beranda");
  const [sosOpen, setSosOpen] = useState(false);
  const [selectedDestination, setSelectedDestination] = useState(destinations[0]);
  const [reportState, setReportState] = useState<ReportState>("idle");
  const [latestIncident, setLatestIncident] = useState<EmergencyIncident | null>(null);
  const [activeIncidentOpen, setActiveIncidentOpen] = useState(false);
  const [closingIncident, setClosingIncident] = useState(false);

  useEffect(() => {
    if (reportState === "idle") return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [reportState]);

  const closeIncident = async (lifecycle: "RESOLVED" | "CANCELLED") => {
    if (!latestIncident || closingIncident) return;
    const action = lifecycle === "RESOLVED" ? "Tandai SOS selesai karena Anda sudah aman?" : "Batalkan laporan SOS ini?";
    if (!window.confirm(`${action}\nRiwayat tetap tersimpan. Perubahan ini hanya tersimpan di perangkat dan belum diberitahukan kepada responder.`)) return;
    setClosingIncident(true);
    try {
      await EmergencyRepository.closeIncident(latestIncident.incident_id, lifecycle);
      setLatestIncident(null);
      setReportState("idle");
      setActiveIncidentOpen(false);
      toast.success(lifecycle === "RESOLVED" ? "SOS ditandai selesai" : "SOS dibatalkan");
    } catch { toast.error("Status belum tersimpan. SOS tetap aktif; coba kembali."); }
    finally { setClosingIncident(false); }
  };
  const [assistantLaunchRequest, setAssistantLaunchRequest] = useState<AssistantLaunchRequest | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refreshIncident=()=>{ void EmergencyRepository.getActiveIncident().then((activeIncident) => {
      if (cancelled) return;
      setLatestIncident(activeIncident);
      setReportState(reportStateForIncident(activeIncident));
    }).catch(() => {
      if (!cancelled) {
        setLatestIncident(null);
        setReportState("idle");
      }
    });
    };
    refreshIncident();
    window.addEventListener('nuresq-repository-change',refreshIncident);
    const preload=window.setTimeout(()=>{void prepareLocalAI();},500);
    return () => { cancelled = true;window.clearTimeout(preload);window.removeEventListener('nuresq-repository-change',refreshIncident); };
  }, []);

  const navigate = useCallback((target: ViewId) => {
    if (target === "sos") {
      if (reportState !== "idle") {
        setActiveIncidentOpen(true);
        return;
      }
      setSosOpen(true);
      return;
    }
    if (reportState !== "idle" && view === "pesan" && target !== view && !window.confirm("Tinggalkan layar SOS aktif? Laporan tetap aktif. Anda dapat kembali melalui tombol SOS.")) return;
    setView(target);
  }, [reportState, view]);

  const openAssistant = useCallback((mode: "assistant" | "responder" = "assistant", draft?: string) => {
    setAssistantLaunchRequest({ key: Date.now(), mode, draft });
    setView("pesan");
  }, []);

  const handleSosSent = (queued: boolean, incident: EmergencyIncident | null) => {
    setReportState(incident ? (queued ? "queued" : reportStateForIncident(incident)) : "idle");
    setLatestIncident(incident);
    setView("beranda");
  };

  const openRoute = (destination?: Destination) => {
    if (destination) setSelectedDestination(destination);
    setView("peta");
  };

  const bannerMode = networkMode;
  const bannerCopy = networkMode === "offline"
    ? { title: "Mode darurat offline", detail: "SOS lokal, panduan, GPS, dan data tersimpan tetap aktif.", icon: Radio }
    : { title: "Jaringan terbatas", detail: connectivity.state === "BACKEND_UNREACHABLE" ? "Layanan nuRESQ tidak dapat dijangkau." : "Koneksi browser ada, tetapi sumber publik belum terverifikasi.", icon: Radio };
  const BannerIcon = bannerCopy.icon;

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem storageKey="nuresq-theme">
      <LayoutGroup id="nuresq-shell">
        <div className="app-shell">
          <DesktopSidebar view={view} navigate={navigate} />

          <div className="app-stage">
            <TopBar view={view} networkMode={networkMode} />

            <AnimatePresence initial={false}>
              {networkMode !== "online" && (
                <motion.div
                  key={bannerMode}
                  className={`network-banner ${bannerMode}`}
                  role="status"
                  initial={reduceMotion ? false : { opacity: 0, y: -14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                  transition={{ duration: reduceMotion ? 0 : 0.22, ease: motionEase.enter }}
                >
                  <BannerIcon aria-hidden="true" />
                  <div><strong>{bannerCopy.title}</strong><span>{bannerCopy.detail}</span></div>
                </motion.div>
              )}
            </AnimatePresence>

            <main className={`main-surface view-${view}`}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.section
                  className="view-transition"
                  key={view}
                  initial={reduceMotion ? false : { opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -3 }}
                  transition={{ duration: reduceMotion ? 0 : motionDuration.normal, ease: motionEase.standard }}
                >
                  {view === "beranda" && (
                    <HomeView
                      reportState={reportState}
                      incident={latestIncident}
                      networkMode={networkMode}
      onSos={() => navigate("sos")}
                      onRoute={openRoute}
                      onAssistant={() => openAssistant("assistant")}
                      location={location}
                      locationRequestState={locationRequestState}
                      onRefreshLocation={refreshLocation}
                      hazardFeed={hazardFeed}
                      hazardState={hazardState}
                      onRefreshHazards={refreshHazards}
                    />
                  )}
                  {view === "peta" && (
                    <MapView
                      destination={selectedDestination}
                      onSelect={setSelectedDestination}
                      location={location}
                      onRefreshLocation={refreshLocation}
                      liveHazards={hazardFeed?.alerts ?? []}
                      networkMode={networkMode}
                    />
                  )}
                  {view === "pesan" && (
                    <AssistantHubPage
                      reportState={reportState}
                      networkMode={networkMode}
                      connectivity={connectivity}
                      location={location}
                      hazardFeed={hazardFeed}
                      onCreateSos={() => navigate("sos")}
                      onOpenMap={() => openRoute()}
                      launchRequest={assistantLaunchRequest}
                    />
                  )}
                  {view === "akun" && (
                    <AccountView
                      networkMode={networkMode}
                      connectivity={connectivity}
                      location={location}
                      hazardFeed={hazardFeed}
                      activeRegion={region}
                      onRegionChange={setRegion}
                      canInstall={canInstall}
                      onInstall={install}
                      onOpenMap={() => openRoute()}
                    />
                  )}
                </motion.section>
              </AnimatePresence>
            </main>
          </div>

          <MobileBottomNav view={view} navigate={navigate} reportActive={reportState !== "idle"} />
          <ActiveIncidentSheet
            open={activeIncidentOpen}
            onOpenChange={setActiveIncidentOpen}
            incident={latestIncident}
            onSummary={() => { setActiveIncidentOpen(false); openAssistant("assistant"); }}
            onUpdate={() => { setActiveIncidentOpen(false); openAssistant("responder", "Kondisi terbaru: "); }}
            onResponder={() => { setActiveIncidentOpen(false); openAssistant("responder"); }}
            onResolve={() => void closeIncident("RESOLVED")}
            onCancel={() => void closeIncident("CANCELLED")}
            closing={closingIncident}
          />
          <SosFlow open={sosOpen} onOpenChange={setSosOpen} networkMode={networkMode} connectivityState={connectivity.state} location={location} onSent={handleSosSent} />
          <Toaster position="top-center" richColors closeButton />
        </div>
      </LayoutGroup>
    </ThemeProvider>
  );
}

function DesktopSidebar({ view, navigate }: { view: ViewId; navigate: (view: ViewId) => void }) {
  return (
    <aside className="desktop-sidebar">
      <Brand />
      <nav aria-label="Navigasi utama">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.id === view;
          return (
            <motion.button
              type="button"
              key={item.id}
              className={`${active ? "active" : ""} ${item.id === "sos" ? "sos-nav" : ""}`}
              onClick={() => navigate(item.id)}
              aria-current={active ? "page" : undefined}
              whileTap={{ scale: 0.975 }}
            >
              {active && <motion.span className="sidebar-active-indicator" layoutId="desktop-nav-active" transition={tactileSpring} />}
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </motion.button>
          );
        })}
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-local-note"><HardDrive /><span><strong>Mode pribadi</strong><small>Data SOS disimpan di perangkat</small></span></div>
    </aside>
  );
}

function TopBar({ view, networkMode }: { view: ViewId; networkMode: NetworkMode }) {
  return (
    <header className="topbar">
      <div className="mobile-brand"><Brand /></div>
      <div className="desktop-title"><p>nuRESQ / {viewTitles[view]}</p><h1>{viewTitles[view]}</h1></div>
      <div className="topbar-actions"><StatusPill mode={networkMode} /><ThemeToggle /></div>
    </header>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const isLight = resolvedTheme === "light";
  return (
    <motion.button
      type="button"
      className="icon-button theme-toggle"
      onClick={() => setTheme(isLight ? "dark" : "light")}
      aria-label={isLight ? "Gunakan mode gelap" : "Gunakan mode terang"}
      title={isLight ? "Mode gelap" : "Mode terang"}
      whileTap={{ scale: 0.94 }}
      suppressHydrationWarning
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={isLight ? "sun" : "moon"} initial={{ opacity: 0, rotate: -18 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: 18 }}>
          {isLight ? <Sun /> : <Moon />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

function MobileBottomNav({ view, navigate, reportActive }: { view: ViewId; navigate: (view: ViewId) => void; reportActive: boolean }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.nav className="mobile-bottom-nav" aria-label="Navigasi utama seluler" initial={false}>
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = item.id === view;
        const isSos = item.id === "sos";
        return (
          <motion.button
            type="button"
            key={item.id}
            className={`${active ? "active" : ""} ${isSos ? "sos-center" : ""} ${isSos && reportActive ? "incident-active" : ""}`}
            onClick={() => navigate(item.id)}
            aria-current={active ? "page" : undefined}
            aria-label={isSos && reportActive ? "SOS, terdapat insiden aktif" : item.label}
            whileTap={reduceMotion ? undefined : { scale: 0.97 }}
            transition={tactileSpring}
          >
            {active && !isSos && <motion.span className="nav-active-indicator" layoutId="mobile-nav-active" transition={tactileSpring} />}
            <span className={isSos ? "sos-center-disc" : "nav-icon-wrap"}>
              {isSos && <span className="sos-center-ring" aria-hidden="true" />}
              <Icon aria-hidden="true" />
            </span>
            <small>{item.label}</small>
          </motion.button>
        );
      })}
    </motion.nav>
  );
}


function ActiveIncidentSheet({ open, onOpenChange, incident, onSummary, onUpdate, onResponder, onResolve, onCancel, closing }: {
  onResolve: () => void;
  onCancel: () => void;
  closing: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  incident: EmergencyIncident | null;
  onSummary: () => void;
  onUpdate: () => void;
  onResponder: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="active-incident-sheet">
        <SheetHeader>
          <span className="active-incident-kicker"><Siren /> SOS AKTIF</span>
          <SheetTitle>{incident?.type ?? "Laporan SOS aktif"}</SheetTitle>
          <SheetDescription>{incident ? `${incident.incident_id} · ${priorityLabel(incident.risk_level)}` : "Permintaan bantuan masih aktif."}</SheetDescription>
        </SheetHeader>
        <div className="active-incident-sheet-actions">
          <button type="button" disabled={closing} onClick={onResolve}>Saya sudah aman — Selesaikan SOS</button>
          <button type="button" disabled={closing} onClick={onCancel}>Batalkan laporan SOS</button>
          <button type="button" onClick={onSummary}><Sparkles /><span><strong>Lihat Ringkasan</strong><small>Buka konteks insiden di Asisten</small></span><ChevronRight /></button>
          <button type="button" onClick={onUpdate}><MessageSquareText /><span><strong>Perbarui Kondisi</strong><small>Siapkan pembaruan untuk insiden ini</small></span><ChevronRight /></button>
          <button type="button" onClick={onResponder}><Radio /><span><strong>Buka Responder</strong><small>Komunikasi terkait insiden dan status pengiriman</small></span><ChevronRight /></button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface HomeViewProps {
  reportState: ReportState;
  incident: EmergencyIncident | null;
  networkMode: NetworkMode;
  onSos: () => void;
  onRoute: (destination?: Destination) => void;
  onAssistant: () => void;
  location: LocationSnapshot | null;
  locationRequestState: LocationSnapshot["mode"];
  onRefreshLocation: () => void;
  hazardFeed: LiveHazardFeed | null;
  hazardState: "loading" | "fresh" | "cached" | "error";
  onRefreshHazards: () => void;
}

function HomeView({ reportState, incident, networkMode, onSos, onRoute, onAssistant, location, locationRequestState, onRefreshLocation, hazardFeed, hazardState, onRefreshHazards }: HomeViewProps) {
  const reduceMotion = useReducedMotion();
  const trust = location
    ? locationTrustCopy(location.mode, location.freshness, location.ageMs)
    : locationTrustCopy(locationRequestState);

  return (
    <div className="home-layout">
      <section className="home-primary">
        <div className="section-heading home-heading">
          <div><span>LOKASI SAYA</span><h2>{location?.label ?? "Lokasi belum tersedia"}</h2></div>
          <div className="location-actions">
            <span className={`location-trust ${trust.tone}`}>{location?.mode === "GPS_TRUSTED" ? <ShieldCheck /> : <MapPin />}{trust.label}</span>
            <button type="button" className="refresh-location" onClick={onRefreshLocation} disabled={locationRequestState === "GPS_REQUESTING"}>
              <LocateFixed /> {locationRequestState === "GPS_REQUESTING" ? "Memeriksa…" : "Perbarui"}
            </button>
          </div>
        </div>
        <p className="location-meta">{location?.accuracy ? `Akurasi ±${Math.round(location.accuracy)} m · ` : ""}{trust.detail}</p>
        {networkMode === "offline" && (
          <div className="offline-core-note" role="status">
            <Radio />
            <div><strong>Mode darurat offline</strong><span>Tetap aktif: SOS lokal, asesmen keselamatan, panduan, GPS, dan riwayat.</span><small>Tidak tersedia: pembaruan bahaya, tile baru, routing online, dan komunikasi responder.</small></div>
          </div>
        )}

        <AnimatePresence mode="popLayout" initial={false}>
          {reportState === "ready" ? (
            <motion.article layout layoutId="home-emergency-state" key="ready" className="active-response-card report-ready-card" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={tactileSpring}>
              <div className="response-icon"><Siren /></div>
              <div className="response-copy"><span className="eyebrow">SOS AKTIF</span><h2>{incident ? `${incident.type ?? "Insiden darurat"} · ${priorityLabel(incident.risk_level)}` : "Permintaan bantuan masih aktif"}</h2><p>{incident ? incidentStatusPresentation(incident, networkMode).detail : "Belum ada konfirmasi dari sistem."}</p></div>
              <div className="response-actions">
                <button type="button" className="primary-action" onClick={onAssistant}><Sparkles /> Buka Asisten</button>
                <button type="button" className="secondary-action" onClick={() => onRoute()}><Map /> Buka Peta</button>
              </div>
            </motion.article>
          ) : reportState === "queued" ? (
            <motion.article layout layoutId="home-emergency-state" key="queued" className="queued-card" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={tactileSpring}>
              <div className="queued-icon"><Siren /></div>
              <div><span>SOS AKTIF</span><h2>{incident ? `${incident.type ?? "Insiden darurat"} · ${priorityLabel(incident.risk_level)}` : "Permintaan bantuan masih aktif"}</h2><p>{incident ? `${incidentStatusPresentation(incident, networkMode).deliveryDetail ?? "Tersimpan di perangkat."} ${incidentStatusPresentation(incident, networkMode).detail}` : "Tersimpan di perangkat · menunggu jalur pengiriman."}</p></div>
              <button type="button" className="text-link-action" onClick={onAssistant}>Buka Asisten <ChevronRight /></button>
            </motion.article>
          ) : (
            <motion.article layout layoutId="home-emergency-state" key="idle" className="sos-panel" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} transition={tactileSpring}>
              <div className="sos-copy">
                <span className="eyebrow">BUTUH BANTUAN SEKARANG?</span>
                <h2>Mulai laporan darurat dalam satu langkah.</h2>
                <p>Tahan 1,9 detik agar SOS tidak terbuka tanpa sengaja.</p>
                <div className="safety-points"><span><ShieldCheck /> Ringkasan lokal</span><span><Radio /> Bekerja offline</span></div>
              </div>
              <SOSButton onComplete={onSos} />
            </motion.article>
          )}
        </AnimatePresence>

        {reportState === "idle" && (
          <button type="button" className="home-assistant-entry" onClick={onAssistant}><Sparkles /><span><small>TIDAK DALAM KEADAAN DARURAT?</small><strong>Tanya Asisten nuRESQ</strong></span><ChevronRight /></button>
        )}

        <LiveRiskPanel feed={hazardFeed} state={hazardState} onRefresh={onRefreshHazards} onOpenMap={() => onRoute()} />
      </section>

      <aside className="home-secondary">
        <div className="section-heading"><div><span>TITIK REFERENSI PETA</span><h2>Periksa sebelum berangkat</h2></div><small>OpenStreetMap</small></div>
        <div className="destination-list reference-destinations">
          {destinations.map((destination) => {
            const Icon = destination.kind === "hospital" ? Cross : destination.kind === "shelter" ? House : MapPin;
            return (
              <button type="button" key={destination.id} onClick={() => onRoute(destination)}>
                <span className={`destination-icon ${destination.kind}`}><Icon /></span>
                <span className="destination-copy"><strong>{destination.name}</strong><small>{destination.capacity}</small></span>
                <ChevronRight />
              </button>
            );
          })}
        </div>
        <p className="reference-note">Titik diambil sebagai referensi peta. Status operasional, kapasitas, dan akses aman belum diverifikasi.</p>
        <div className="home-map-preview">
          <SafetyMap selected={destinations[0]} onSelect={(item) => onRoute(item)} destinations={destinations} userLocation={location} onRequestLocation={onRefreshLocation} liveHazards={hazardFeed?.alerts ?? []} compact />
          <button type="button" className="map-preview-cta" onClick={() => onRoute()}><Map /> Buka Peta</button>
        </div>
      </aside>
    </div>
  );
}

function MapView({
  destination,
  onSelect,
  location,
  onRefreshLocation,
  liveHazards,
  networkMode,
}: {
  destination: Destination;
  onSelect: (destination: Destination) => void;
  location: LocationSnapshot | null;
  onRefreshLocation: () => void;
  liveHazards: LiveHazardAlert[];
  networkMode: NetworkMode;
}) {
  const reduceMotion = useReducedMotion();
  const navigation = useNavigationState();
  const routeActive = isNavigationActive(navigation.state);
  const [sheetSnap, setSheetSnap] = useState<"peek" | "half" | "full">("half");
  const [travelMode, setTravelMode] = useState<TravelMode>("walking");
  const [runMode, setRunMode] = useState<NavigationRunMode>("REAL_NAVIGATION");
  const [isTouchSheet, setIsTouchSheet] = useState(false);
  const [routeOrigin, setRouteOrigin] = useState<[number, number] | null>(null);
  const [requestRevision, setRequestRevision] = useState(0);
  const [tripExpanded, setTripExpanded] = useState(false);
  const [endArmed, setEndArmed] = useState(false);
  const endArmTimer = useRef<number | null>(null);
  const offRouteTracker = useRef<OffRouteTracker>({ consecutiveOutside: 0, offRoute: false });
  const lastProgressFix = useRef<string | null>(null);
  const rerouteStarted = useRef(false);
  const pendingRerouteRevision = useRef<number | null>(null);
  const routeProgressTracker = useRef(new RouteProgressTracker());
  const previousOffRouteDistance = useRef<number | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 959px)");
    const update = () => setIsTouchSheet(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const demoRequested = new URLSearchParams(window.location.search).get("demo-nav") === "1";
    const timer = window.setTimeout(() => setRunMode(demoRequested ? "DEMO_NAVIGATION" : "REAL_NAVIGATION"), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const availableOrigin = useMemo<[number, number] | null>(() => {
    if (runMode === "DEMO_NAVIGATION") return [MAP_DEFAULT_CENTER.longitude, MAP_DEFAULT_CENTER.latitude];
    return location ? [location.longitude, location.latitude] : null;
  }, [location, runMode]);

  useEffect(() => {
    if (routeActive) return;
    const timer = window.setTimeout(() => setRouteOrigin(availableOrigin), 0);
    return () => window.clearTimeout(timer);
  }, [availableOrigin, destination.id, routeActive, travelMode]);

  const route = useNavigationRoute({ origin: routeOrigin, destination, travelMode, requestRevision });
  const routeSummary = route.summary;
  const tracking = useNavigationTracking({
    active: routeActive,
    baseLocation: runMode === "REAL_NAVIGATION" ? location : null,
    routeCoordinates: routeSummary?.coordinates ?? [],
    runMode,
  });
  const navigationLocation = routeActive ? tracking.navigationLocation : location;
  useEffect(() => {
    routeProgressTracker.current.setRoute(routeSummary);
  }, [routeSummary]);
  const routeTracking = useMemo(() => {
    if (!navigationLocation || !routeSummary) return { progress: null, matchedCoordinate: null, matched: false, confidence: "low" as const };
    routeProgressTracker.current.setRoute(routeSummary);
    return routeProgressTracker.current.update(navigationLocation, travelMode);
  }, [navigationLocation, routeSummary, travelMode]);
  const progress = routeTracking.progress;
  const maneuver = useMemo(() => (
    routeSummary && progress ? currentManeuver(routeSummary.maneuvers, progress.travelledDistanceMeters) : null
  ), [progress, routeSummary]);
  const routeHazard = useMemo(() => nearestRouteHazard(
    liveHazards,
    progress?.remainingCoordinates ?? routeSummary?.coordinates ?? [],
  ), [liveHazards, progress?.remainingCoordinates, routeSummary?.coordinates]);

  const navigationViewModel = useMemo<NavigationViewModel>(() => {
    const gpsQuality = navigationLocation?.mode === "GPS_STALE" || navigationLocation?.freshness === "VERY_STALE"
      ? "stale"
      : navigationLocation?.mode === "GPS_SUSPICIOUS"
        ? "suspicious"
        : navigationLocation?.mode === "GPS_LOW_ACCURACY"
          ? "weak"
          : "good";
    const remainingSeconds = progress?.remainingDurationSeconds ?? null;
    return {
      status: navigation.state,
      cameraMode: cameraModeForState(navigation.state),
      rawLocation: routeActive ? tracking.rawLocation : location,
      trustedLocation: routeActive ? tracking.trustedLocation : location?.mode === "GPS_TRUSTED" ? location : null,
      visualLocation: routeTracking.matchedCoordinate,
      matchedLocation: routeTracking.matched ? routeTracking.matchedCoordinate : null,
      bearing: Number.isFinite(navigationLocation?.heading) ? navigationLocation!.heading! : null,
      speed: Math.max(0, navigationLocation?.speed ?? 0),
      gpsQuality,
      route: routeSummary,
      routeProgress: progress,
      currentManeuver: maneuver?.maneuver ?? null,
      nextManeuver: maneuver?.next ?? null,
      distanceRemaining: progress?.remainingDistanceMeters ?? null,
      durationRemaining: remainingSeconds,
      eta: remainingSeconds === null ? null : new Date(Date.now() + remainingSeconds * 1_000),
      offRouteState: offRouteTracker.current.offRoute
        ? "off-route"
        : offRouteTracker.current.consecutiveOutside > 0
          ? "pending"
          : "on-route",
    };
  }, [location, maneuver, navigation.state, navigationLocation, progress, routeActive, routeSummary, routeTracking, tracking.rawLocation, tracking.trustedLocation]);

  useEffect(() => {
    if (navigation.state !== "NAV_STARTING") return;
    const timer = window.setTimeout(() => {
      navigation.dispatch({ type: routeSummary?.mode === "direction" ? "DIRECTION_ONLY" : "STARTED" });
    }, reduceMotion ? 0 : 360);
    return () => window.clearTimeout(timer);
  }, [navigation, reduceMotion, routeSummary?.mode]);

  const effectiveCameraMode = cameraModeForState(navigation.state);

  useEffect(() => {
    if (!routeActive || !routeSummary) return;
    if (networkMode === "offline" && routeSummary.mode === "road") {
      navigation.dispatch({ type: "OFFLINE_ROUTE" });
      return;
    }
    if (networkMode === "terbatas") {
      navigation.dispatch({ type: "NETWORK_DEGRADED" });
      return;
    }
    if (networkMode === "online" && (navigation.state === "OFFLINE_ROUTE" || navigation.state === "NETWORK_DEGRADED")) {
      navigation.dispatch({ type: "NETWORK_RECOVERED", headingUp: true });
    }
  }, [navigation, networkMode, routeActive, routeSummary]);

  useEffect(() => {
    if (!routeActive || !navigationLocation || !progress || !routeSummary) return;
    const fixKey = `${navigationLocation.updatedAt}-${tracking.fixSequence}`;
    if (lastProgressFix.current === fixKey) return;
    lastProgressFix.current = fixKey;

    if (navigationLocation.mode === "GPS_STALE" || navigationLocation.freshness === "VERY_STALE") {
      navigation.dispatch({ type: "GPS_STALE" });
      return;
    }
    if (navigationLocation.mode === "GPS_LOW_ACCURACY" || navigationLocation.mode === "GPS_SUSPICIOUS") {
      navigation.dispatch({ type: "GPS_WEAK" });
      return;
    }
    if (navigation.state === "GPS_WEAK" || navigation.state === "GPS_STALE") {
      navigation.dispatch({ type: routeSummary.mode === "direction" ? "DIRECTION_ONLY" : "GPS_RECOVERED" });
    }

    const arrival = arrivalState(progress.remainingDistanceMeters, travelMode);
    if (arrival === "ARRIVED") {
      navigation.dispatch({ type: "ARRIVED" });
      navigator.vibrate?.([45, 35, 45]);
      return;
    }
    if (arrival === "ARRIVING") navigation.dispatch({ type: "ARRIVING" });

    if (routeSummary.mode !== "road" || navigation.state === "REROUTING") return;
    const previousDistance = previousOffRouteDistance.current;
    const movingAway = previousDistance === null || progress.distanceFromRouteMeters >= previousDistance - 2;
    previousOffRouteDistance.current = progress.distanceFromRouteMeters;
    offRouteTracker.current = updateOffRouteTracker(
      offRouteTracker.current,
      progress.distanceFromRouteMeters,
      travelMode,
      navigationLocation.accuracy ?? Number.POSITIVE_INFINITY,
      movingAway,
    );
    if (offRouteTracker.current.offRoute) navigation.dispatch({ type: "OFF_ROUTE_CONFIRMED" });
    else if (offRouteTracker.current.consecutiveOutside > 0) navigation.dispatch({ type: "OFF_ROUTE_POSSIBLE" });
    else if (navigation.state === "OFF_ROUTE_PENDING") navigation.dispatch({ type: "ON_ROUTE", headingUp: true });
  }, [navigation, navigationLocation, progress, routeActive, routeSummary, tracking.fixSequence, travelMode]);

  useEffect(() => {
    if (navigation.state !== "REROUTING") {
      rerouteStarted.current = false;
      return;
    }
    if (rerouteStarted.current) return;
    rerouteStarted.current = true;
    const timer = window.setTimeout(() => {
      if (networkMode !== "online" || !navigationLocation) {
        navigation.dispatch({ type: "REROUTE_FAILURE" });
        toast.warning("Rute baru belum dapat dihitung", { description: "Rute lama tetap terlihat sebagai referensi." });
        return;
      }
      const revision = requestRevision + 1;
      pendingRerouteRevision.current = revision;
      setRouteOrigin([navigationLocation.longitude, navigationLocation.latitude]);
      setRequestRevision(revision);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [navigation, navigationLocation, networkMode, requestRevision]);

  useEffect(() => {
    const pendingRevision = pendingRerouteRevision.current;
    if (pendingRevision === null || route.loadedRevision !== pendingRevision) return;
    pendingRerouteRevision.current = null;
    offRouteTracker.current = { consecutiveOutside: 0, offRoute: false };
    if (route.state === "ready" && route.summary?.mode === "road") {
      navigation.dispatch({ type: "REROUTE_SUCCESS" });
      toast.success("Rute diperbarui");
    } else {
      navigation.dispatch({ type: "REROUTE_FAILURE" });
      toast.warning("Rute jalan tidak tersedia", { description: "Menampilkan arah menuju tujuan." });
    }
  }, [navigation, route.loadedRevision, route.state, route.summary?.mode]);

  useEffect(() => {
    if (navigation.state !== "ENDED") return;
    const timer = window.setTimeout(() => {
      navigation.dispatch({ type: "RESET" });
      setTripExpanded(false);
      setSheetSnap("half");
      setRouteOrigin(availableOrigin);
    }, reduceMotion ? 0 : 240);
    return () => window.clearTimeout(timer);
  }, [availableOrigin, navigation, reduceMotion]);

  useEffect(() => () => {
    if (endArmTimer.current !== null) window.clearTimeout(endArmTimer.current);
  }, []);

  const selectDestination = useCallback((next: Destination) => {
    onSelect(next);
    navigation.dispatch({ type: "RESET" });
    setSheetSnap("half");
    setRequestRevision((current) => current + 1);
  }, [navigation, onSelect]);

  const changeTravelMode = (mode: TravelMode) => {
    setTravelMode(mode);
    navigation.dispatch({ type: "RESET" });
    setRouteOrigin(availableOrigin);
    setRequestRevision((current) => current + 1);
  };

  const onSheetDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.velocity.y < -320 || info.offset.y < -76) setSheetSnap("full");
    else if (info.velocity.y > 320 || info.offset.y > 82) setSheetSnap("peek");
    else setSheetSnap("half");
  };

  const startRoute = () => {
    if (!availableOrigin) {
      toast.warning("Lokasi perangkat belum tersedia", { description: "Aktifkan GPS agar navigasi tidak memakai titik tampilan peta." });
      onRefreshLocation();
      return;
    }
    if (!routeSummary || route.state === "loading") {
      toast.info("Rute masih disiapkan");
      return;
    }
    setRouteOrigin(availableOrigin);
    setTripExpanded(false);
    offRouteTracker.current = { consecutiveOutside: 0, offRoute: false };
    navigation.dispatch({ type: "START" });
    navigator.vibrate?.(55);
    toast.success(routeSummary.mode === "road" ? "Navigasi dimulai" : "Arah tujuan dimulai", {
      description: routeSummary.mode === "road" ? "Tetap periksa kondisi jalan dan arahan petugas." : "Garis bukan rute jalan.",
    });
  };

  const finishNavigation = () => {
    if (navigation.state !== "ARRIVED" && !endArmed) {
      setEndArmed(true);
      endArmTimer.current = window.setTimeout(() => setEndArmed(false), 3_500);
      return;
    }
    setEndArmed(false);
    navigation.dispatch({ type: "END" });
    toast.info(navigation.state === "ARRIVED" ? "Navigasi selesai" : "Navigasi diakhiri");
  };

  const destinationKind = destination.kind === "hospital" ? "Fasilitas kesehatan" : destination.kind === "shelter" ? "Area terbuka" : "Titik referensi";
  const hazardCopy = routeHazard
    ? `${routeHazard.alert.title} dilaporkan ${routeHazard.distanceFromRouteMeters <= 120 ? "dekat rute di depan" : `sekitar ${Math.round(routeHazard.distanceFromRouteMeters / 10) * 10} m dari rute di depan`}`
    : null;

  return (
    <div className={`map-page ${routeActive ? "navigation-active" : "route-preview"}`}>
      <SafetyMap
        selected={destination}
        onSelect={selectDestination}
        destinations={destinations}
        routeActive={routeActive}
        userLocation={navigationLocation}
        visualNavigationLocation={navigationViewModel.visualLocation}
        onRequestLocation={onRefreshLocation}
        routeSummary={routeSummary}
        liveHazards={liveHazards}
        travelMode={travelMode}
        navigationState={navigation.state}
        cameraMode={effectiveCameraMode}
        navigationProgress={navigationViewModel.routeProgress}
        maneuverDistanceMeters={maneuver?.distanceMeters ?? null}
        networkMode={networkMode}
        onSelectAlternative={route.selectAlternative}
        onUserGesture={navigation.userGesture}
        onRecenter={() => {
          if (navigation.state === "FOLLOWING") navigation.dispatch({ type: "FOLLOW_HEADING" });
          else navigation.recenter();
        }}
        onOverview={() => navigation.dispatch({ type: "OVERVIEW" })}
        onNorthUp={() => navigation.dispatch({ type: "NORTH_UP" })}
        onRecenterComplete={() => navigation.dispatch({ type: "RECENTERED", headingUp: false })}
        onInteractionHold={navigation.holdFreePan}
        navigationTopInset={routeActive ? 122 : 48}
        navigationBottomInset={routeActive ? (tripExpanded ? 274 : 156) : 64}
        upcomingManeuverCoordinate={maneuver?.maneuver.coordinate ?? null}
        upcomingManeuverKind={maneuver?.maneuver.kind ?? null}
      />

      {!routeActive && (
        <motion.aside className={`route-panel sheet-${sheetSnap}`} drag={isTouchSheet && !reduceMotion ? "y" : false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={0.18} onDragEnd={onSheetDragEnd} layout transition={tactileSpring}>
          <button type="button" className="route-panel-handle" onClick={() => setSheetSnap((current) => current === "peek" ? "half" : current === "half" ? "full" : "peek")} aria-label={`Panel ${sheetSnap}. Ketuk untuk mengubah tinggi panel`}><span /></button>
          <span className="eyebrow">TUJUAN TERPILIH {runMode === "DEMO_NAVIGATION" ? "· SIMULASI" : ""}</span>
          <div className="route-title-row"><div><h2>{destination.name}</h2><p>{destinationKind}</p></div><span className="neutral">Belum diverifikasi</span></div>
          <div className="travel-mode-control" role="group" aria-label="Mode perjalanan">
            <span>Mode perjalanan</span>
            <div>
              <button type="button" className={travelMode === "walking" ? "active" : ""} onClick={() => changeTravelMode("walking")} aria-pressed={travelMode === "walking"}><Footprints /> Jalan kaki</button>
              <button type="button" className={travelMode === "driving" ? "active" : ""} onClick={() => changeTravelMode("driving")} aria-pressed={travelMode === "driving"}><Car /> Kendaraan</button>
            </div>
          </div>
          <div className="route-metrics">
            <div><Route /><span><strong>{routeSummary?.distanceLabel ?? (availableOrigin ? "Menghitung" : "—")}</strong><small>{routeSummary?.mode === "road" ? "Jarak jalan" : "Jarak arah"}</small></span></div>
            <div><Clock3 /><span><strong>{routeSummary?.durationLabel ?? "—"}</strong><small>Estimasi</small></span></div>
            <div><ShieldCheck /><span><strong>{liveHazards.length ? "Data terbatas" : "Belum dinilai"}</strong><small>Risiko rute</small></span></div>
          </div>
          {route.options.length > 1 && (
            <div className="route-alternatives" aria-label="Pilihan rute kendaraan">
              {route.options.map((option, index) => {
                const differenceMinutes = Math.round((option.durationSeconds - route.options[0].durationSeconds) / 60);
                return <button type="button" key={option.id} className={route.selectedIndex === index ? "active" : ""} onClick={() => route.selectAlternative(index)} aria-pressed={route.selectedIndex === index}><span>{index === 0 ? "Rute utama" : `Rute alternatif ${index}`}</span><small>{differenceMinutes > 0 ? `+${differenceMinutes} menit` : option.durationLabel}</small></button>;
              })}
            </div>
          )}
          <div className="route-explanation">
            <strong>Data yang tersedia</strong>
            <ul><li>{!availableOrigin ? "Lokasi perangkat diperlukan sebelum menghitung arah" : routeSummary?.mode === "road" ? "Rute kendaraan dihitung OSRM dari data jalan OpenStreetMap" : travelMode === "walking" ? "Provider saat ini tidak mendukung profil jalan kaki; garis hanya menunjukkan arah" : "Layanan navigasi gagal; garis hanya menunjukkan arah"}</li><li>{liveHazards.length ? `${liveHazards.length} alert sumber publik tampil di peta` : "Belum ada alert berkoordinat pada area peta"}</li><li>Status tujuan dan kondisi jalan perlu dikonfirmasi</li></ul>
          </div>
          <button type="button" className="primary-action route-action" onClick={startRoute}><Navigation /> {routeSummary?.mode === "road" ? "Mulai Navigasi" : "Mulai Arah Tujuan"}</button>
          <p className={`route-updated ${routeSummary?.mode === "direction" ? "fallback" : ""}`}>{!availableOrigin ? "Area tampilan: Kota Malang · bukan lokasi korban" : `${routeSummary?.mode === "direction" ? "Layanan navigasi jalan tidak tersedia · garis hanya menunjukkan arah tujuan" : "nuRESQ tidak menjamin rute bebas bahaya"}${routeSummary ? ` · ${freshnessCopy(routeSummary.freshness, routeSummary.retrievedAt)}` : ""}`}</p>
        </motion.aside>
      )}

      {routeActive && (
        <div className="navigation-overlay-layer">
          <div className="navigation-top-stack">
            <ManeuverCard state={navigation.state} maneuver={maneuver?.maneuver ?? null} nextManeuver={maneuver?.next ?? null} distanceMeters={maneuver?.distanceMeters ?? null} directionOnly={routeSummary?.mode === "direction"} />
            <NavigationNotice networkMode={networkMode} state={navigation.state} trackingError={tracking.trackingError} runMode={runMode} locationAgeCopy={navigationLocation ? ageCopy(navigationLocation.ageMs) : null} />
            {routeHazard && hazardCopy && <RouteHazardWarning title={hazardCopy} freshness={freshnessCopy(routeHazard.alert.freshness, routeHazard.alert.retrievedAt)} stale={routeHazard.alert.freshness === "STALE" || routeHazard.alert.freshness === "UNKNOWN"} />}
          </div>
          <TripProgressPanel destination={destination} progress={progress} travelMode={travelMode} directionOnly={routeSummary?.mode === "direction"} hazardsKnown={liveHazards.length > 0} expanded={tripExpanded} onToggle={() => setTripExpanded((current) => !current)} endArmed={endArmed} onEnd={finishNavigation} arrived={navigation.state === "ARRIVED"} />
        </div>
      )}
    </div>
  );
}
