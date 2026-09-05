# nuRESQ Hybrid Foundation

```mermaid
flowchart TD
  Input[Text or voice transcript] --> Normalize[Input normalization]
  Normalize --> NLU[Local ONNX encoder and rule parser]
  NLU --> Fusion[Source tracked fact fusion]
  Fusion --> Safety[Existing deterministic Safety Core]
  Safety --> Local[Local answer and IndexedDB]
  Local --> Mode[Health and capability resolver]
  Mode -->|Offline or unavailable| Guides[Local guides and durable outbox]
  Mode -->|Online| Backend[Backend API and SQLite]
  Backend --> ACK[Validate real server ACK]
  ACK --> UI[Citizen UI]
  Guides --> UI
```

Model classification is a candidate only. Confirmed SOS type and explicit parser facts determine the safety draft. Backend enrichment returns allowed guide IDs and unchanged locked priority, never replaces local safety. Conversation history, photos, audio and contacts are not sent. Only submitted text, minimal intent/priority and incident ID go to assistant analysis. Explicit SOS and messages sync from a durable outbox.

| Capability | Offline prepared localhost/PWA | Online |
|---|---|---|
| Local ONNX | Yes if assets prepared and supported; otherwise rules | Same |
| Deterministic safety | Yes (known blocking defects documented) | Same |
| Local guides | Yes | Yes |
| SOS creation / local storage | Yes | Yes |
| Queue | Yes | Yes |
| Backend sync / real server ACK | No | Yes after successful response |
| Responder / cloud agent | No | Not implemented |

IndexedDB v3 retains all existing stores and adds hybrid-outbox. Original snapshot uses existing incident UUID. Update ID and acknowledgement are independent. Original SOS ACK survives updates. Failed operations retain the original captured time and coordinates. The backend's received_at records arrival time only.

UI changes are limited to small local capability text and accurate delivery wording. Map, navigation/tracking/camera, styles and bottom navigation are not redesigned. Explicit legacy relay support remains; the hybrid foundation uses backend incident updates and makes no responder claims.
