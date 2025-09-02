## Absensi Siswa QR (Mobile Web tanpa login)

Aplikasi web untuk guru melakukan absensi siswa via QR Code. Dibuat dengan HTML, CSS, dan JavaScript; backend menggunakan Firebase Realtime Database. Responsif dan nyaman di ponsel.

### Fitur
- Manajemen kelas dan siswa (buat kelas, tambah/hapus siswa)
- Generate QR Code per siswa (kelas + nomor + nama)
- Scan QR dengan kamera HP (html5-qrcode)
- Simpan absensi otomatis ke Firebase (timestamp ISO 8601 UTC)
- Rekap berdasarkan kelas, tanggal, mapel
- Export ke Excel (.xlsx): Tanggal | Mata Pelajaran | Nomor Siswa | Nama Siswa | Status Kehadiran | Timestamp

### Struktur Data (contoh)
```
{
  "kelas": {
    "KelasA": {
      "siswa": {
        "01": {"nama": "Andi", "nomor": "01"},
        "02": {"nama": "Budi", "nomor": "02"}
      }
    }
  },
  "absensi": {
    "KelasA": {
      "2025-09-02": {
        "Matematika": {
          "01": {"nama": "Andi", "timestamp": "2025-09-02T08:10:00Z", "status": "Hadir"},
          "02": {"nama": "Budi", "timestamp": "2025-09-02T08:12:00Z", "status": "Hadir"}
        }
      }
    }
  }
}
```

### Setup Firebase
1. Buat project di Firebase Console dan aktifkan Realtime Database.
2. Ambil konfigurasi Web App (apiKey, authDomain, databaseURL, projectId, appId, dst.).
3. Edit `index.html` bagian `window.FIREBASE_CONFIG` dengan nilai milik Anda.

Contoh:
```
window.FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "...",
  databaseURL: "https://<project-id>-default-rtdb.firebaseio.com",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

Rules dev (sementara, jangan untuk produksi):
```
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

### Menjalankan Lokal (akses kamera butuh HTTPS/localhost)
- Jalankan server lokal lalu buka `http://localhost:<port>/`.
- Contoh:
  - Python: `python3 -m http.server 5500`
  - Node: `npx serve -l 5500`

### Alur Penggunaan
1. Kelas & Siswa: buat kelas, pilih kelas, tambah siswa.
2. Generate QR: pilih kelas, muat siswa, klik tombol QR dan unduh PNG.
3. Scan Absensi: pilih kelas, isi mapel, pilih tanggal, mulai scan; data otomatis tersimpan.
4. Rekap & Export: pilih filter, tampilkan, lalu export ke Excel.

### Catatan
- Payload QR: `{ v, jenis: 'absensi-siswa', kelas, nomor, nama, uid }`.
- Dedup scan: cegah input ganda ~30 detik dan cek ke Firebase jika sudah hadir.
- Timestamp menggunakan `toISOString()` (UTC).

# APLIKASI-ANDROID
Daftar Aplikasi Androdi Apk
