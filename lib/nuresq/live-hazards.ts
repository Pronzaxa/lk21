import type {
  HazardKind,
  HazardSeverity,
  LiveHazardAlert,
} from "./types";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(asString(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanText(value: unknown, fallback: string) {
  const text = asString(value).replace(/\s+/g, " ").trim();
  return text || fallback;
}

function parseCoordinates(value: unknown): [number, number] | null {
  const [latitude, longitude] = asString(value).split(",").map((part) => Number.parseFloat(part));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return [latitude, longitude];
}

function timestamp(value: unknown) {
  const raw = asString(value);
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

export function distanceInKm(
  fromLatitude: number,
  fromLongitude: number,
  toLatitude: number,
  toLongitude: number,
) {
  const toRadians = (value: number) => value * Math.PI / 180;
  const earthRadiusKm = 6_371;
  const latitudeDelta = toRadians(toLatitude - fromLatitude);
  const longitudeDelta = toRadians(toLongitude - fromLongitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(fromLatitude))
    * Math.cos(toRadians(toLatitude))
    * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function withDistances(
  alerts: LiveHazardAlert[],
  latitude: number,
  longitude: number,
) {
  const severityRank: Record<HazardSeverity, number> = { critical: 0, warning: 1, advisory: 2 };
  return alerts
    .map((alert) => {
      if (!Number.isFinite(alert.latitude) || !Number.isFinite(alert.longitude)) return alert;
      return {
        ...alert,
        distanceKm: distanceInKm(latitude, longitude, alert.latitude!, alert.longitude!),
      };
    })
    .sort((left, right) => {
      const severityDelta = severityRank[left.severity] - severityRank[right.severity];
      if (severityDelta !== 0) return severityDelta;
      return (left.distanceKm ?? Number.POSITIVE_INFINITY) - (right.distanceKm ?? Number.POSITIVE_INFINITY);
    });
}

export function parseBmkgEarthquake(payload: unknown): LiveHazardAlert[] {
  const root = asRecord(payload);
  const info = asRecord(root?.Infogempa);
  const quake = asRecord(info?.gempa);
  if (!quake) return [];

  const coordinates = parseCoordinates(quake.Coordinates);
  const magnitude = asNumber(quake.Magnitude);
  const potential = cleanText(quake.Potensi, "Periksa pembaruan BMKG");
  const tsunami = potential.toLowerCase().includes("tsunami") && !potential.toLowerCase().includes("tidak");
  const severity: HazardSeverity = tsunami ? "critical" : magnitude >= 5 ? "warning" : "advisory";
  const observedAt = timestamp(quake.DateTime);
  const retrievedAt = new Date().toISOString();

  return [{
    id: `bmkg-quake-${observedAt}`,
    kind: "earthquake",
    severity,
    title: `Gempa M${magnitude.toFixed(1)}`,
    detail: `${cleanText(quake.Wilayah, "Indonesia")} · kedalaman ${cleanText(quake.Kedalaman, "belum tersedia")}`,
    advice: tsunami
      ? "Jauhi pantai dan ikuti arahan resmi BMKG/BPBD."
      : "Periksa dampak di sekitar Anda dan ikuti pembaruan resmi BMKG.",
    sourceName: "BMKG",
    sourceUrl: "https://data.bmkg.go.id/gempabumi/",
    observedAt,
    latitude: coordinates?.[0],
    longitude: coordinates?.[1],
    confidence: "official",
    retrievedAt,
    freshness: "FRESH",
  }];
}

interface WeatherPoint {
  datetime: string;
  description: string;
  temperature: number;
  precipitation: number;
  windSpeed: number;
}

function weatherPoints(payload: unknown) {
  const root = asRecord(payload);
  const entries = Array.isArray(root?.data) ? root.data : [];
  const points: WeatherPoint[] = [];

  entries.forEach((entry) => {
    const record = asRecord(entry);
    const days = Array.isArray(record?.cuaca) ? record.cuaca : [];
    days.forEach((day) => {
      if (!Array.isArray(day)) return;
      day.forEach((item) => {
        const forecast = asRecord(item);
        if (!forecast) return;
        points.push({
          datetime: timestamp(forecast.datetime ?? forecast.utc_datetime),
          description: cleanText(forecast.weather_desc, "Kondisi belum tersedia"),
          temperature: asNumber(forecast.t),
          precipitation: asNumber(forecast.tp),
          windSpeed: asNumber(forecast.ws),
        });
      });
    });
  });

  return points.sort((left, right) => Date.parse(left.datetime) - Date.parse(right.datetime));
}

export function parseBmkgWeather(payload: unknown): LiveHazardAlert[] {
  const root = asRecord(payload);
  const location = asRecord(root?.lokasi);
  const points = weatherPoints(payload);
  if (!location || !points.length) return [];

  const now = Date.now();
  const retrievedAt = new Date(now).toISOString();
  const future = points.filter((point) => Date.parse(point.datetime) >= now - 60 * 60 * 1000);
  const windowPoints = (future.length ? future : points).slice(0, 8);
  const next = windowPoints[0];
  const riskiest = windowPoints.reduce((current, point) => {
    const score = point.precipitation * 2 + point.windSpeed
      + (/petir|lebat/i.test(point.description) ? 60 : /hujan/i.test(point.description) ? 20 : 0);
    const currentScore = current.precipitation * 2 + current.windSpeed
      + (/petir|lebat/i.test(current.description) ? 60 : /hujan/i.test(current.description) ? 20 : 0);
    return score > currentScore ? point : current;
  }, next);

  const severeWeather = /petir|lebat|ekstrem/i.test(riskiest.description)
    || riskiest.precipitation >= 10
    || riskiest.windSpeed >= 50;
  const moderateWeather = /hujan/i.test(riskiest.description)
    || riskiest.precipitation >= 3
    || riskiest.windSpeed >= 35;
  const severity: HazardSeverity = severeWeather ? "warning" : moderateWeather ? "advisory" : "advisory";
  const area = cleanText(location.desa ?? location.kecamatan, "lokasi Anda");
  const forecastCopy = severeWeather || moderateWeather
    ? `${riskiest.description} diprakirakan dalam 24 jam`
    : `${next.description} pada pembaruan terdekat`;

  return [{
    id: `bmkg-weather-${asString(location.adm4, area)}-${next.datetime}`,
    kind: "weather",
    severity,
    title: severeWeather ? "Cuaca berisiko" : `Prakiraan ${area}`,
    detail: `${forecastCopy} · ${Math.round(riskiest.temperature)}°C · angin ${Math.round(riskiest.windSpeed)} km/jam`,
    advice: severeWeather
      ? "Siapkan rute aman dan pantau peringatan dini resmi BMKG."
      : "Belum ada sinyal cuaca berbahaya pada prakiraan yang diterima.",
    sourceName: "BMKG",
    sourceUrl: "https://data.bmkg.go.id/prakiraan-cuaca/",
    observedAt: next.datetime,
    expiresAt: windowPoints.at(-1)?.datetime,
    latitude: asNumber(location.lat),
    longitude: asNumber(location.lon),
    confidence: "official",
    retrievedAt,
    freshness: "FRESH",
  }];
}

function hazardKind(value: unknown): HazardKind {
  const type = asString(value).toLowerCase();
  if (type.includes("flood") || type.includes("banjir")) return "flood";
  if (type.includes("earthquake") || type.includes("gempa")) return "earthquake";
  if (type.includes("fire") || type.includes("kebakaran")) return "fire";
  if (type.includes("landslide") || type.includes("longsor")) return "landslide";
  if (type.includes("volcano") || type.includes("gunung")) return "volcano";
  if (type.includes("wind") || type.includes("haze") || type.includes("cuaca")) return "weather";
  return "other";
}

function hazardLabel(kind: HazardKind) {
  return {
    earthquake: "Gempa dilaporkan",
    flood: "Banjir dilaporkan",
    fire: "Kebakaran dilaporkan",
    weather: "Cuaca berbahaya dilaporkan",
    landslide: "Longsor dilaporkan",
    volcano: "Aktivitas gunung api dilaporkan",
    other: "Kejadian dilaporkan",
  }[kind];
}

function featureList(payload: unknown) {
  const root = asRecord(payload);
  const result = asRecord(root?.result);
  if (Array.isArray(result?.features)) return result.features;
  const objects = asRecord(result?.objects);
  const output = asRecord(objects?.output);
  return Array.isArray(output?.geometries) ? output.geometries : [];
}

export function parsePetaBencana(payload: unknown): LiveHazardAlert[] {
  const retrievedAt = new Date().toISOString();
  return featureList(payload).flatMap((item): LiveHazardAlert[] => {
    const feature = asRecord(item);
    const properties = asRecord(feature?.properties);
    const geometry = asRecord(feature?.geometry);
    const coordinateValue = geometry?.coordinates ?? feature?.coordinates;
    const coordinates = Array.isArray(coordinateValue) ? coordinateValue : [];
    const longitude = asNumber(coordinates[0], Number.NaN);
    const latitude = asNumber(coordinates[1], Number.NaN);
    if (!properties || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];

    const kind = hazardKind(properties.disaster_type);
    const reportData = asRecord(properties.report_data);
    const floodDepth = asNumber(reportData?.flood_depth ?? reportData?.depth);
    const severity: HazardSeverity = floodDepth >= 71
      ? "critical"
      : floodDepth >= 31 || ["fire", "landslide", "volcano"].includes(kind)
        ? "warning"
        : "advisory";
    const observedAt = timestamp(properties.created_at);
    const confirmed = asString(properties.status).toLowerCase() === "confirmed";
    const detail = cleanText(properties.text ?? properties.title, "Laporan lapangan tanpa keterangan tambahan");

    return [{
      id: `petabencana-${cleanText(properties.pkey, observedAt)}`,
      kind,
      severity,
      title: hazardLabel(kind),
      detail: floodDepth > 0 ? `${detail} · kedalaman ${Math.round(floodDepth)} cm` : detail,
      advice: "Verifikasi kondisi di sekitar dan ikuti arahan BPBD sebelum bergerak.",
      sourceName: confirmed ? "PetaBencana · terkonfirmasi" : "PetaBencana · laporan warga",
      sourceUrl: "https://petabencana.id/",
      observedAt,
      latitude,
      longitude,
      confidence: "community",
      retrievedAt,
      freshness: "FRESH",
    }];
  });
}
