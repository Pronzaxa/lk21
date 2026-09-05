"use client";

import { ShieldCheck } from "lucide-react";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand" aria-label="nuRESQ — Tanggap. Terhubung. Selamat.">
      <span className="brand-mark" aria-hidden="true">
        <ShieldCheck strokeWidth={2.4} />
      </span>
      {!compact && (
        <span className="brand-copy">
          <strong>
            nu<span>RESQ</span>
          </strong>
          <small>Tanggap. Terhubung. Selamat.</small>
        </span>
      )}
    </div>
  );
}
