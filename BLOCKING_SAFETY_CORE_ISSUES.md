# Existing Safety Core — blocking operational issues

Source safety.ts is intentionally unchanged, as requested. These are actual executed probes, not presumed fixes. Do not treat this foundation build as validated emergency triage until a separate safety-core revision passes these examples.

- FAIL: "korban bernapas" — expected false, observed true.
- FAIL: "korban belum bernapas" — expected true, observed false.
- FAIL: "korban belum sadar" — expected true, observed false.
- FAIL: "air tidak sampai pinggang" — expected false, observed true.
- FAIL: "tidak ada asap tebal" — expected false, observed true.
