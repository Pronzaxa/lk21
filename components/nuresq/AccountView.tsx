"use client";

import {
  BellRing,
  BookOpenCheck,
  ChevronRight,
  CircleHelp,
  ContactRound,
  Download,
  Globe2,
  HardDrive,
  History,
  Laptop,
  MapPinned,
  Moon,
  Network,
  Plus,
  Settings,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
  Vibrate,
  Wifi,
  WifiOff,
  Gauge,
  Database,
  MapPin,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { fieldGuides } from "@/lib/nuresq/field-guides";
import { EmergencyRepository } from "@/lib/nuresq/emergency-repository";
import { freshnessCopy } from "@/lib/nuresq/freshness";
import { useEmergencyReadiness } from "@/hooks/useEmergencyReadiness";
import type { ConnectivityReport } from "@/lib/nuresq/connectivity";
import type { ActiveRegion, EmergencyContact, LiveHazardFeed, LocationSnapshot, NetworkMode } from "@/lib/nuresq/types";
import { getAssistantModelPreference, setAssistantModelPreference, type AssistantModelPreference } from "@/config/nuresq.config";

type DetailId = "readiness" | "device" | "offline-map" | "contacts" | "network" | "region" | "history" | "help" | "settings";

export function AccountView({
  networkMode,
  canInstall,
  onInstall,
  onOpenMap,
  connectivity,
  location,
  hazardFeed,
  activeRegion,
  onRegionChange,
}: {
  networkMode: NetworkMode;
  canInstall: boolean;
  onInstall: () => Promise<boolean>;
  onOpenMap: () => void;
  connectivity: ConnectivityReport;
  location: LocationSnapshot | null;
  hazardFeed: LiveHazardFeed | null;
  activeRegion: ActiveRegion | null;
  onRegionChange: (region: ActiveRegion | null) => void;
}) {
  const [detail, setDetail] = useState<DetailId | null>(null);
  const readiness = useEmergencyReadiness(location, hazardFeed);
  const actions = [
    { id: "device", icon: Smartphone, title: "Perangkat Ini", detail: "Penyimpanan lokal aktif" },
    { id: "offline-map", icon: MapPinned, title: "Peta Offline", detail: "Cache saat peta digunakan" },
    { id: "contacts", icon: ContactRound, title: "Kontak Darurat", detail: "Disimpan hanya di perangkat" },
    { id: "network", icon: Wifi, title: "Status Jaringan", detail: networkMode === "online" ? "Sumber publik terjangkau" : networkMode === "terbatas" ? "Perlu verifikasi koneksi" : "Mode offline aktif" },
    { id: "region", icon: MapPin, title: "Wilayah Aktif", detail: activeRegion?.label ?? "Belum dipilih" },
    { id: "history", icon: History, title: "Riwayat Laporan", detail: "Laporan darurat yang tersimpan di perangkat" },
    { id: "help", icon: CircleHelp, title: "Panduan", detail: "Pertolongan awal offline" },
    { id: "settings", icon: Settings, title: "Pengaturan", detail: "Notifikasi dan tampilan" },
  ] as const;

  return (
    <div className="content-page account-page">
      <article className="account-profile private-profile">
        <span className="avatar large"><ShieldCheck /></span>
        <div><span className="eyebrow">PROFIL DARURAT</span><h2>Mode pribadi</h2><p>Disimpan lokal terlebih dahulu. SOS disinkronkan saat layanan tersedia.</p></div>
        <span className="verified"><HardDrive /> Lokal</span>
      </article>

      <button type="button" className="readiness-summary" onClick={() => setDetail("readiness")}>
        <span className="readiness-score"><Gauge /><strong>{readiness.score}</strong><small>/100</small></span>
        <span><small>KESIAPAN DARURAT</small><strong>{readiness.score >= 80 ? "Perangkat cukup siap" : "Masih ada yang perlu disiapkan"}</strong><em>Skor dihitung dari capability nyata</em></span>
        <ChevronRight />
      </button>

      <div className="account-grid">
        {actions.map(({ id, icon: Icon, title, detail: actionDetail }) => (
          <button type="button" key={id} onClick={() => setDetail(id)}>
            <span><Icon /></span><div><strong>{title}</strong><small>{actionDetail}</small></div><ChevronRight />
          </button>
        ))}
      </div>

      <div className="account-footer-actions single-action">
        <button
          type="button"
          className="primary-action"
          onClick={async () => {
            if (!canInstall) {
              setDetail("readiness");
              return;
            }
            const installed = await onInstall();
            toast.info(installed ? "Instalasi nuRESQ dimulai" : "Prompt instalasi belum tersedia");
          }}
        ><Download /> {canInstall ? "Instal Aplikasi" : "Periksa Kesiapan"}</button>
      </div>

      <Sheet open={Boolean(detail)} onOpenChange={(open) => !open && setDetail(null)}>
        <SheetContent className="account-sheet" side="right">
          {detail && <AccountDetail
            id={detail}
            networkMode={networkMode}
            connectivity={connectivity}
            readiness={readiness}
            activeRegion={activeRegion}
            onRegionChange={onRegionChange}
            hazardFeed={hazardFeed}
            onOpenMap={() => { setDetail(null); onOpenMap(); }}
          />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function AccountDetail({ id, networkMode, connectivity, readiness, activeRegion, onRegionChange, hazardFeed, onOpenMap }: {
  id: DetailId;
  networkMode: NetworkMode;
  connectivity: ConnectivityReport;
  readiness: ReturnType<typeof useEmergencyReadiness>;
  activeRegion: ActiveRegion | null;
  onRegionChange: (region: ActiveRegion | null) => void;
  hazardFeed: LiveHazardFeed | null;
  onOpenMap: () => void;
}) {
  if (id === "readiness") return <ReadinessDetail readiness={readiness} hazardFeed={hazardFeed} />;
  if (id === "network") return <NetworkDetail mode={networkMode} connectivity={connectivity} />;
  if (id === "region") return <RegionDetail activeRegion={activeRegion} onRegionChange={onRegionChange} />;
  if (id === "offline-map") return <OfflineMaps onOpenMap={onOpenMap} />;
  if (id === "contacts") return <ContactsDetail />;
  if (id === "history") return <IncidentHistoryDetail />;
  if (id === "settings") return <SettingsDetail />;
  if (id === "help") return <HelpDetail />;

  const serviceWorkerReady = readiness.state.appOffline;
  const vibrationReady = typeof navigator !== "undefined" && "vibrate" in navigator;
  const indexedDbReady = typeof window !== "undefined" && "indexedDB" in window;
  return (
    <>
      <SheetHeader>
        <span className="sheet-icon"><Smartphone /></span>
        <SheetTitle>Perangkat Ini</SheetTitle>
        <SheetDescription>Kemampuan yang benar-benar tersedia pada browser ini.</SheetDescription>
      </SheetHeader>
      <div className="detail-rows">
        <div><strong>Analisis lokal</strong><span>{readiness.localAIState==='READY'?'Siap digunakan':'Analisis dasar tersedia'}</span></div>
        <button type="button" className="secondary-action" onClick={()=>void readiness.prepareLocalAI()}>Siapkan analisis lokal</button>
        <div><strong>IndexedDB darurat</strong><span>{indexedDbReady ? "✓ tersedia" : "— tidak tersedia"}</span></div>
        <div><strong>App shell offline</strong><span>{serviceWorkerReady ? "✓ aktif" : "— belum aktif"}</span></div>
        <div><strong>Storage persisten</strong><span>{readiness.state.storagePersisted ? "✓ diberikan" : "⚠ tidak dijamin"}</span></div>
        <div><strong>Getar darurat</strong><span>{vibrationReady ? "✓ didukung" : "— tidak didukung"}</span></div>
      </div>
    </>
  );
}

function IncidentHistoryDetail() {
  const [incidents, setIncidents] = useState<import("@/lib/nuresq/types").EmergencyIncident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void EmergencyRepository.getIncidentHistory()
      .then((items) => { if (!cancelled) setIncidents([...items].reverse()); })
      .catch(() => { if (!cancelled) setIncidents([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <SheetHeader>
        <span className="sheet-icon"><History /></span>
        <SheetTitle>Riwayat Laporan</SheetTitle>
        <SheetDescription>Laporan darurat yang tersimpan di perangkat ini.</SheetDescription>
      </SheetHeader>
      <div className="incident-history-list">
        {loading ? <p className="incident-history-empty">Memuat riwayat…</p> : incidents.length ? incidents.map((incident) => (
          <article key={incident.incident_id}>
            <header><span>{incident.type ?? "Insiden"}</span><strong>{incident.risk_level}</strong></header>
            <h3>{incident.incident_id}</h3>
            {incident.incident_lifecycle && <p>{incident.incident_lifecycle === "RESOLVED" ? "SOS selesai" : incident.incident_lifecycle === "CANCELLED" ? "SOS dibatalkan" : "SOS aktif"}{incident.closed_at ? ` · ${new Date(incident.closed_at).toLocaleString("id-ID")}` : ""}</p>}
            <p>{new Date(incident.timestamp).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</p>
            <footer><span>{incident.connectivity_state === "OFFLINE" ? "Tersimpan offline" : "Tersimpan di perangkat"}</span><em>{incident.acknowledgement ? "Ada konfirmasi sistem" : "Belum ada konfirmasi"}</em></footer>
          </article>
        )) : <p className="incident-history-empty">Belum ada laporan darurat tersimpan.</p>}
      </div>
    </>
  );
}

function ContactsDetail() {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    let cancelled = false;
    void EmergencyRepository.getContacts().then((saved) => { if (!cancelled) setContacts(saved); }).catch(() => setContacts([]));
    return () => { cancelled = true; };
  }, []);

  const persist = (next: EmergencyContact[]) => {
    setContacts(next);
    void EmergencyRepository.saveContacts(next).catch(() => toast.error("Kontak belum tersimpan"));
  };

  const addContact = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || phone.trim().length < 6) return;
    persist([...contacts, { id: crypto.randomUUID?.() ?? String(Date.now()), name: name.trim(), phone: phone.trim() }]);
    setName("");
    setPhone("");
    toast.success("Kontak disimpan di perangkat");
  };

  return (
    <>
      <SheetHeader>
        <span className="sheet-icon"><ContactRound /></span>
        <SheetTitle>Kontak Darurat</SheetTitle>
        <SheetDescription>Kontak tidak diunggah. Anda tetap memilih kapan ringkasan SOS dibagikan.</SheetDescription>
      </SheetHeader>
      {contacts.length ? (
        <div className="contact-list">
          {contacts.map((contact) => (
            <div key={contact.id}><span><strong>{contact.name}</strong><small>{contact.phone}</small></span><button type="button" onClick={() => persist(contacts.filter((item) => item.id !== contact.id))} aria-label={`Hapus ${contact.name}`}><Trash2 /></button></div>
          ))}
        </div>
      ) : <div className="contact-empty"><ContactRound /><strong>Belum ada kontak</strong><span>Tambahkan orang yang dapat Anda hubungi saat darurat.</span></div>}
      <form className="contact-form" onSubmit={addContact}>
        <label>Nama<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nama kontak" autoComplete="name" /></label>
        <label>Nomor telepon<input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="08…" inputMode="tel" autoComplete="tel" /></label>
        <button type="submit" className="primary-action" disabled={!name.trim() || phone.trim().length < 6}><Plus /> Simpan Kontak</button>
      </form>
    </>
  );
}

function HelpDetail() {
  return (
    <>
      <SheetHeader>
        <span className="sheet-icon"><BookOpenCheck /></span>
        <SheetTitle>Panduan Lapangan Offline</SheetTitle>
        <SheetDescription>Tersimpan bersama aplikasi. Panduan ini bukan diagnosis medis.</SheetDescription>
      </SheetHeader>
      <div className="field-guide-list">
        {fieldGuides.map((guide, index) => (
          <details key={guide.id} open={index === 0}>
            <summary><span><strong>{guide.title}</strong><small>{guide.summary}</small></span><ChevronRight /></summary>
            <ol>{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol>
          </details>
        ))}
      </div>
      <p className="field-guide-note"><ShieldCheck /> Untuk kondisi medis, hubungi petugas darurat dan ikuti arahan profesional.</p>
    </>
  );
}

function NetworkDetail({ mode, connectivity }: { mode: NetworkMode; connectivity: ConnectivityReport }) {
  const online = mode === "online";
  const [pending, setPending] = useState(0);
  useEffect(() => {
    void EmergencyRepository.getPendingIncidents().then((items) => setPending(items.length)).catch(() => setPending(0));
  }, []);
  return (
    <>
      <SheetHeader>
        <span className="sheet-icon"><Network /></span>
        <SheetTitle>Status Komunikasi</SheetTitle>
        <SheetDescription>Status menggabungkan flag browser dan probe endpoint publik; bukan simulasi.</SheetDescription>
      </SheetHeader>
      <div className="network-summary"><span className={`signal-label ${mode}`}>{mode === "offline" ? <WifiOff /> : <Wifi />}{online ? "Terhubung" : mode === "terbatas" ? "Jaringan terbatas" : "Offline"}</span><p>{online ? "Endpoint publik berhasil dijangkau." : mode === "terbatas" ? "Browser terhubung, tetapi akses layanan belum dapat dipastikan." : "Laporan tetap dapat disimpan di perangkat."}</p></div>
      <div className="network-rows">
        <div><span>Flag browser</span><strong>{connectivity.browserOnline ? "terhubung" : "offline"}</strong></div>
        <div><span>Endpoint publik</span><strong>{connectivity.publicEndpointReachable ? "✓ terjangkau" : "— belum terjangkau"}</strong></div>
        <div><span>Laporan tertunda</span><strong>{pending}</strong></div>
        <div><span>Backend pengiriman</span><strong>{connectivity.backendConfigured ? (connectivity.backendReachable ? "✓ terjangkau" : "— tidak terjangkau") : "Belum dikonfigurasi"}</strong></div>
        <div><span>Pemeriksaan terakhir</span><strong>{new Date(connectivity.checkedAt).getTime() > 0 ? new Date(connectivity.checkedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "Belum diperiksa"}</strong></div>
      </div>
    </>
  );
}

function ReadinessDetail({ readiness, hazardFeed }: {
  readiness: ReturnType<typeof useEmergencyReadiness>;
  hazardFeed: LiveHazardFeed | null;
}) {
  const { state, score } = readiness;
  const rows = [
    ["Aplikasi offline", state.appOffline ? "✓ siap" : "— service worker belum aktif"],
    ["Panduan darurat", state.guidesOffline ? "✓ tersimpan" : "— belum tersedia"],
    ["Lokasi terakhir", state.hasTrustedLocation ? "✓ tersimpan" : "— belum tersedia"],
    ["Peta cache", state.cachedMapTiles > 0 ? `✓ ${state.cachedMapTiles} tile` : "— belum tersimpan"],
    ["Data risiko", hazardFeed ? freshnessCopy(hazardFeed.freshness, hazardFeed.retrievedAt) : "— belum tersedia"],
    ["Kontak darurat", `${state.contacts} tersimpan`],
    ["AI Lokal", "Belum tersedia"],
    ["Voice Offline", "Belum tersedia"],
  ];
  return (
    <>
      <SheetHeader>
        <span className="sheet-icon"><Gauge /></span>
        <SheetTitle>Kesiapan Darurat · {score}/100</SheetTitle>
        <SheetDescription>Skor hanya memakai capability dan data yang benar-benar tersedia di perangkat ini.</SheetDescription>
      </SheetHeader>
      <div className="readiness-detail-list">
        {rows.map(([label, value]) => <div key={label}><strong>{label}</strong><span>{value}</span></div>)}
      </div>
      <div className="storage-readiness">
        <Database />
        <div><strong>Storage darurat</strong><p>{state.storagePersisted ? "✓ Persisten" : state.storageSupported ? "⚠ Browser dapat membersihkan cache" : "— API persistence tidak tersedia"}</p></div>
      </div>
      <button type="button" className="primary-action sheet-action" onClick={() => {
        void readiness.refresh(true).then(() => toast.info("Kesiapan diperiksa ulang", { description: "Izin persistence tetap ditentukan oleh browser." }));
      }}><ShieldCheck /> Siapkan Perangkat</button>
    </>
  );
}

function RegionDetail({ activeRegion, onRegionChange }: {
  activeRegion: ActiveRegion | null;
  onRegionChange: (region: ActiveRegion | null) => void;
}) {
  const [adm4, setAdm4] = useState(activeRegion?.adm4 ?? "");
  const [label, setLabel] = useState(activeRegion?.label ?? "");
  const valid = /^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(adm4) && label.trim().length >= 3;
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    onRegionChange({ adm4, label: label.trim() });
    toast.success("Wilayah aktif diperbarui", { description: "Data cuaca berikutnya akan memakai ADM4 ini." });
  };
  return (
    <>
      <SheetHeader>
        <span className="sheet-icon"><MapPin /></span>
        <SheetTitle>Wilayah Aktif</SheetTitle>
        <SheetDescription>GPS tidak otomatis dipetakan ke ADM4. Pilihan ini eksplisit agar cuaca wilayah lain tidak ditampilkan sebagai lokasi Anda.</SheetDescription>
      </SheetHeader>
      <div className="active-region-state"><strong>{activeRegion?.label ?? "Belum dipilih"}</strong><span>{activeRegion?.adm4 ?? "Data cuaca wilayah belum tersedia"}</span></div>
      <button type="button" className="secondary-action region-known" onClick={() => {
        const region = { adm4: "35.73.05.1011", label: "Lowokwaru, Kota Malang", latitude: -7.957, longitude: 112.632 };
        setAdm4(region.adm4); setLabel(region.label); onRegionChange(region);
      }}>Gunakan Lowokwaru, Kota Malang</button>
      <form className="contact-form region-form" onSubmit={save}>
        <label>Kode ADM4<input value={adm4} onChange={(event) => setAdm4(event.target.value.replace(/[^0-9.]/g, ""))} placeholder="00.00.00.0000" inputMode="numeric" /></label>
        <label>Nama wilayah<input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Contoh: Kelurahan, Kota" /></label>
        <button type="submit" className="primary-action" disabled={!valid}><MapPin /> Simpan Wilayah</button>
      </form>
      {activeRegion && <button type="button" className="text-link-action region-clear" onClick={() => { onRegionChange(null); setAdm4(""); setLabel(""); }}>Hapus pilihan wilayah</button>}
    </>
  );
}

function OfflineMaps({ onOpenMap }: { onOpenMap: () => void }) {
  return (
    <>
      <SheetHeader>
        <span className="sheet-icon"><MapPinned /></span>
        <SheetTitle>Peta Offline</SheetTitle>
        <SheetDescription>Tile peta yang pernah dibuka dapat disimpan otomatis oleh cache browser.</SheetDescription>
      </SheetHeader>
      <div className="offline-map-info"><HardDrive /><div><strong>Cache sesuai penggunaan</strong><p>Buka area penting ketika online. Ketersediaan offline bergantung pada ruang penyimpanan dan kebijakan browser.</p></div></div>
      <button type="button" className="primary-action sheet-action" onClick={onOpenMap}><MapPinned /> Buka Peta Sekarang</button>
    </>
  );
}

function SettingsDetail() {
  const [sound, setSound] = useState(true);
  const [vibration, setVibration] = useState(true);
  const { theme, setTheme } = useTheme();
  const [assistantModel, setAssistantModel] = useState<AssistantModelPreference>(() => getAssistantModelPreference());
  const themeOptions = [
    { id: "dark", label: "Gelap", icon: Moon },
    { id: "light", label: "Terang", icon: Sun },
    { id: "system", label: "Sistem", icon: Laptop },
  ] as const;
  return (
    <>
      <SheetHeader>
        <span className="sheet-icon"><Settings /></span>
        <SheetTitle>Pengaturan</SheetTitle>
        <SheetDescription>Pilihan yang memengaruhi penggunaan darurat.</SheetDescription>
      </SheetHeader>
      <div className="settings-groups">
        <section><h3>Komunikasi</h3><div><span><Network /><b>Mode jaringan</b></span><strong>Otomatis</strong></div></section>
        <section>
          <h3>Model Asisten</h3>
          <p className="settings-help-copy">Pilih model untuk pertanyaan umum. Analisis SOS tetap dikunci oleh Safety Core lokal.</p>
          <div className="theme-options model-options" role="group" aria-label="Pilih model asisten">
            {([
              ["AUTO", "Otomatis", "Gemini saat online, SmolLM2 saat offline"],
              ["LOCAL", "SmolLM2 Lokal", "Privat dan berjalan tanpa internet"],
              ["GEMINI", "Gemini Online", "Jawaban online jika backend dan key tersedia"],
            ] as const).map(([id, label, description]) => <button type="button" key={id} className={assistantModel === id ? "active" : ""} onClick={() => { setAssistantModel(id); setAssistantModelPreference(id); toast.success(`Model asisten: ${label}`); }} aria-pressed={assistantModel === id}><span><strong>{label}</strong><small>{description}</small></span></button>)}
          </div>
        </section>
        <section><h3>Notifikasi</h3><div><span><BellRing /><b>Suara</b></span><Switch checked={sound} onCheckedChange={setSound} aria-label="Aktifkan suara" /></div><div><span><Vibrate /><b>Getar</b></span><Switch checked={vibration} onCheckedChange={setVibration} aria-label="Aktifkan getar" /></div></section>
        <section>
          <h3>Tampilan</h3>
          <div className="theme-setting-row">
            <span><Smartphone /><b>Tema</b></span>
            <span className="theme-options" role="group" aria-label="Pilih tema tampilan">
              {themeOptions.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={theme === id ? "active" : ""} onClick={() => setTheme(id)} aria-pressed={theme === id}><Icon /> {label}</button>)}
            </span>
          </div>
        </section>
        <section><h3>Bahasa</h3><div><span><Globe2 /><b>Bahasa UI</b></span><strong>Indonesia</strong></div></section>
      </div>
    </>
  );
}
