import type {
  InjuryAssessment,
  InjuryPriority,
  InjuryRedFlags,
  InjuryVisualCheck,
} from "./types";

export const emptyInjuryFlags: InjuryRedFlags = {
  uncontrolledBleeding: false,
  unconscious: false,
  breathingDifficulty: false,
  suspectedFracture: false,
};

export function evaluateInjuryAssessment(
  visual: InjuryVisualCheck,
  redFlags: InjuryRedFlags,
  now = new Date(),
): InjuryAssessment {
  const reasons: string[] = [];
  const guidance: string[] = [];
  let priority: InjuryPriority = "pantau";

  if (redFlags.breathingDifficulty) reasons.push("korban sulit atau tidak bernapas normal");
  if (redFlags.unconscious) reasons.push("korban tidak sadar atau tidak merespons");
  if (redFlags.uncontrolledBleeding) reasons.push("perdarahan belum terkendali");

  if (redFlags.breathingDifficulty || redFlags.unconscious || redFlags.uncontrolledBleeding) {
    priority = "kritis";
    guidance.push("Hubungi bantuan darurat setempat sekarang dan ikuti instruksi petugas.");
    if (redFlags.uncontrolledBleeding) {
      guidance.push("Tekan area yang berdarah dengan kain bersih sambil menunggu bantuan.");
    }
  } else if (redFlags.suspectedFracture) {
    priority = "tinggi";
    reasons.push("diduga ada patah tulang atau bentuk anggota tubuh tidak normal");
    guidance.push("Jangan luruskan atau memindahkan bagian yang diduga patah.");
    guidance.push("Minta pemeriksaan tenaga medis sesegera mungkin.");
  } else {
    reasons.push("tidak ada tanda bahaya yang dikonfirmasi pada checklist");
    guidance.push("Pantau perubahan kondisi dan minta pemeriksaan tenaga medis bila memburuk.");
  }

  if (visual.quality === "ulang") {
    reasons.push("foto kurang jelas; hasil visual tidak dipakai untuk menaikkan atau menurunkan prioritas");
  } else if (visual.redPixelRatio >= 0.08) {
    reasons.push("area kemerahan terlihat pada foto dan perlu diperiksa manusia");
  }

  return {
    priority,
    redFlags,
    reasons,
    guidance,
    visual,
    createdAt: now.toISOString(),
  };
}

export function injurySummary(assessment: InjuryAssessment) {
  const label = assessment.priority === "kritis"
    ? "triase luka kritis"
    : assessment.priority === "tinggi"
      ? "triase luka prioritas tinggi"
      : "triase luka perlu dipantau";
  return `${label}; ${assessment.reasons.join("; ")}`;
}
