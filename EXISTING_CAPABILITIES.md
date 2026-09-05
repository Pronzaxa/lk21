# Audit sebelum Task 2

- Digunakan kembali: AssistantHubPage, SosFlow, safety.ts, IndexedDB v2, active-incident-id, lifecycle RESOLVED/CANCELLED, pesan beserta event delivery, panduan lokal, PWA/portable Vite.
- Backend yang ada hanya proxy hazard pada Next/Vinext; belum ada incident persistence, health nuRESQ, capability discovery, atau sync. Backend foundation dipisahkan memakai Node HTTP + SQLite, tanpa framework server tambahan.
- checkConnectivity saat ini dapat menyatakan CONNECTED berdasarkan BMKG tanpa backend nuRESQ. useConnectivity akan dihubungkan ke health/capabilities sendiri.
- applyConfirmedIncidentUpdate menghapus ACK awal. Akan dipisahkan ACK original dan ACK update.
- Asisten berupa rule matcher, bukan model AI. Runtime ONNX, tokenizer, embedding retrieval, timeout dan status faktual ditambahkan.
- Destinasi adalah titik referensi belum diverifikasi; responder/relay/cloud belum terpasang. Tidak ada kemampuan tersebut yang akan dinyatakan aktif.
- MapLibre, navigation, tracking, GPS trust, stylesheet, hierarki SOS dan bottom navigation dipertahankan.
- Safety Core memiliki kasus negasi yang perlu diuji. Masalah dicatat terpisah; tidak diam-diam menulis ulang safety.ts.
