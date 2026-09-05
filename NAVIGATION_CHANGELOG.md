# nuRESQ Navigation — GMaps-Class V2 Changelog

## Scope

Revision ini memodifikasi source `nuRESQ-Premium-Navigation-Tracking` yang diberikan. Implementasi tidak dibangun ulang dari nol, tidak mengganti MapLibre, dan tidak menambah dependency runtime baru.

## Bugs / conflicting logic removed

- Menghapus active-navigation camera controller lama yang memanggil `map.easeTo()` setiap perubahan koordinat visual/GPS.
- Menghapus RAF puck terpisah yang dapat berlomba dengan animasi camera.
- Menghapus model camera citizen `FOLLOW / HEADING_UP / OVERVIEW`; sekarang hanya `FOLLOW / EXPLORE / OVERVIEW`, sementara heading-up menjadi state internal.
- Menghapus state navigation lama yang terlalu kasar (`NAVIGATION_FOLLOW`, `NAVIGATION_FREE_PAN`, dll.) dan menggantinya dengan explicit semantic states.
- Menghentikan GPS/network warning agar tidak selalu merebut camera ketika user sedang pan/zoom.
- Menghentikan snap puck ke route ketika akurasi GPS atau confidence map matching tidak memadai.
- Menghentikan off-route confirmation dari fix GPS dengan akurasi buruk.
- Menghapus pulse hazard marker yang berjalan terus menerus.

## Old camera architecture

Sebelumnya:

`GPS fix -> React state -> calculate progress -> visualCoordinate -> useEffect -> map.easeTo()`

Puck memiliki RAF tersendiri, sedangkan camera memiliki lifecycle animasi sendiri. Akibatnya puck dan dunia peta dapat terasa bergerak sebagai satu objek, camera mudah jitter, dan update otomatis berpotensi melawan gesture user.

## New camera architecture

Sekarang:

`Raw GPS -> trust classification -> navigation fix -> route projection/map-match confidence -> NavigationLocationSmoother -> NavigationRenderLoop -> puck + NavigationCameraController -> MapLibre`

Komponen/engine utama:

- `NavigationLocationSmoother`
- `RouteProgressTracker`
- `NavigationCameraController`
- `NavigationRenderLoop`
- `NavigationViewModel`

Active navigation menggunakan **satu controlled `requestAnimationFrame` loop** untuk visual puck dan continuous camera tracking. Continuous follow memakai low-level `map.jumpTo()` pada frame yang sudah didamping; `easeTo()` hanya digunakan untuk transisi diskret seperti recenter. `fitBounds()` digunakan untuk overview.

## Navigation state machine

State semantic yang tersedia:

- `ROUTE_PREVIEW`
- `NAV_STARTING`
- `FOLLOWING`
- `FOLLOWING_HEADING`
- `FREE_PAN`
- `FREE_ZOOM`
- `RECENTERING`
- `ROUTE_OVERVIEW`
- `OFF_ROUTE_PENDING`
- `REROUTING`
- `GPS_WEAK`
- `GPS_STALE`
- `NETWORK_DEGRADED`
- `OFFLINE_ROUTE`
- `DIRECTION_ONLY`
- `ARRIVING`
- `ARRIVED`
- `ENDED`

Citizen-facing camera mode tetap hanya:

- `FOLLOW`
- `EXPLORE`
- `OVERVIEW`

Gesture pan/zoom/rotate mengubah camera ke EXPLORE dan menghentikan auto camera. Recenter dari EXPLORE kembali ke FOLLOW north-up; setelah itu user dapat memilih heading-up dengan recenter/follow action berikutnya.

## Tracking behavior

- REAL GPS dan DEMO GPS dipisahkan.
- Simulated coordinate tidak pernah dipromosikan menjadi `trustedLocation` untuk safety/SOS.
- `rawLocation`, `trustedLocation`, navigation fix, matched coordinate, dan visual coordinate tetap dipisahkan.
- Map matching memakai batas distance + GPS accuracy + GPS state.
- Walking dan driving mempunyai threshold map matching berbeda.
- GPS suspicious/stale tidak dipaksa snap ke road.
- Bearing memakai shortest angular path sehingga `359° -> 1°` tidak berputar 358° ke arah sebaliknya.
- Saat kecepatan rendah, camera bearing mempertahankan last stable bearing dan tidak mengejar compass/GPS noise.

## Route progress and rerouting

- Progress dihitung dari nearest projection pada route geometry dan distance-along-route, bukan jarak lurus menuju destination/maneuver.
- Route dibagi menjadi travelled + remaining geometry.
- Route overview memakai remaining geometry.
- Off-route memerlukan reliable fixes, threshold mode-specific, persistence tiga fix, dan kecenderungan bergerak menjauh.
- Fix berakurasi buruk tidak dihitung sebagai evidence off-route.
- `OFF_ROUTE_PENDING` tidak langsung menampilkan rerouting.
- Saat rerouting, puck/camera tracking tetap berjalan dan existing route tetap tersedia sebagai referensi.
- Ketika network offline, route yang sudah ada tidak dihapus.

## Camera behavior

- Look-ahead mengikuti **remaining route geometry**, bukan offset latitude/longitude acak.
- Look-ahead distance menyesuaikan travel mode + speed.
- Zoom menyesuaikan speed dan jarak ke maneuver dengan hysteresis.
- Pitch dibatasi pada kisaran navigation yang tenang: walking sekitar 32°, driving sekitar 44°, overview sekitar 8°.
- Camera dan puck memakai damping berbeda sehingga puck terasa bergerak di dalam dunia, bukan seluruh dunia melompat mengikuti puck.
- Dynamic MapLibre padding memperhitungkan top maneuver area, right controls, dan tinggi trip panel.

## Motion behavior

- Tidak ada constant puck pulse.
- Hazard marker tidak lagi memiliki pulse terus menerus.
- Upcoming maneuver menggunakan satu cue kecil pada route.
- Recenter memakai eased transition; continuous follow tidak memakai `flyTo`/`easeTo` pada setiap fix.
- Reduced-motion tetap dihormati untuk transition diskret.

## UI/navigation hierarchy

- Maneuver tetap menjadi informasi utama di top banner.
- GPS/network/reroute ditempatkan sebagai secondary navigation notice; warning tidak menggantikan instruksi maneuver utama.
- Right controls tetap terbatas pada compass/layers/overview/recenter.
- Existing route progress styling travelled/remaining dipertahankan.
- Direction-only tetap menggunakan dashed route language dan label `ARAH TUJUAN`.

## Validation performed in this workspace

Lolos:

- TypeScript/TSX syntax parse: **117 files, 0 syntax diagnostics**.
- Core navigation runtime regression checks: **PASS**.
- Bearing wrap `359° -> 1°`.
- Along-route projection/progress.
- User gesture state priority over GPS warning.
- Poor-accuracy fix ignored as off-route evidence.
- Three reliable off-route fixes confirm deviation.
- High-confidence GPS may map-match; poor-accuracy GPS does not map-match.
- Look-ahead coordinate follows route geometry.
- Static audit confirms active navigation has one navigation RAF loop.
- Static audit confirms no camera `easeTo()` effect tied to each GPS/visual coordinate update remains.

## Build verification limitation

Full Vite/Next build was not executed in this sandbox because the uploaded source archive does not include `node_modules`. Global TypeScript syntax parsing and isolated runtime regression checks were used instead. Install dependencies from `package-lock.json` in a normal development environment before final device/browser QA.

## Known limitations / follow-up

- Device-orientation heading fallback is not yet implemented; current priority is GPS heading -> route tangent -> last stable bearing.
- Voice guidance architecture can consume real maneuver data, but speech synthesis/announcement scheduling is not enabled in this revision.
- Offline basemap coverage still depends on the existing service-worker/cache strategy; this revision preserves loaded route/navigation state but does not introduce a new offline tile pack system.
- Real hardware QA is still required for Android GPS, poor-signal urban canyon behavior, landscape, tablet, low-end 30 FPS devices, and real network handover.
- Browser vibration remains best-effort and device/browser dependent.
