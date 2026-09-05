# Portable tanpa npm di komputer pengguna

Folder `../PORTABLE/` adalah distribusi siap-jalan. Pengguna akhir tidak perlu menjalankan
`npm install`, tidak perlu Node.js, dan tidak perlu Vite.

Source React/TypeScript tetap disertakan di folder ini untuk pengembangan. Tooling npm hanya
relevan jika developer ingin melakukan build ulang dari source; tooling tersebut tidak dibutuhkan
untuk menjalankan distribusi `PORTABLE/` yang sudah disiapkan.

Build portable yang disertakan menggunakan modul JavaScript browser hasil transpile dari source V2.
Dependency UI browser pihak ketiga diambil dari `esm.sh` pada pemakaian pertama karena sandbox build
tidak memiliki seluruh tarball dependency npm. Service worker portable meng-cache modul tersebut
setelah berhasil dimuat, selain cache tile/rute/data yang sudah dimiliki nuRESQ.
