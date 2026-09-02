# Sortirr — Universal Smart File & Media Sorter

<p align="center">
  <img src="build/icon.png" width="128" height="128" alt="Sortirr Logo" style="border-radius: 28px; box-shadow: 0 8px 24px rgba(99,102,241,0.35);" />
</p>

<p align="center">
  <b>Aplikasi desktop Windows & web productivity untuk mengorganisasi ribuan foto, video, audio, dan dokumen lokal secepat kilat hanya dengan 1 ketukan tombol keyboard.</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20Web-blue?style=flat-square&logo=windows" alt="Platform" />
  <img src="https://img.shields.io/badge/Release-Desktop%20.EXE%20(Setup%20%26%20Portable)-6366f1?style=flat-square" alt="Desktop EXE" />
  <img src="https://img.shields.io/badge/Engine-Electron%20%7C%20Node.js%20%7C%20FFmpeg-06b6d4?style=flat-square" alt="Engine" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" />
</p>

---

## ⚡ Unduh Versi Windows Desktop (.exe)

Bagi pengguna Windows, Anda **tidak perlu menginstal Node.js, Git, terminal, ataupun Laragon**. Cukup unduh aplikasi siap pakai langsung dari halaman [**GitHub Releases**](https://github.com/satriaksm/sortirr/releases):

| Format Berkas | Tipe | Ukuran | Rekomendasi & Cara Pakai |
| :--- | :---: | :---: | :--- |
| **`Sortirr Setup 1.0.0.exe`** | **Installer** | **~127 MB** | **Direkomendasikan untuk PC/Laptop Utama.** Memiliki wizard instalasi resmi, otomatis membuat icon di Desktop & Start Menu, serta registrasi uninstaller Windows. |
| **`Sortirr-1.0.0-Portable.exe`** | **Portable** | **~126 MB** | **Langsung Klik & Jalan (Tanpa Instalasi).** Sangat praktis disimpan di flashdisk atau harddisk eksternal untuk digunakan di komputer mana pun tanpa meninggalkan file sistem. |

### Cara Cepat Menggunakan (Desktop App):
1. **Unduh** salah satu file `.exe` di atas dari tab [Releases](https://github.com/satriaksm/sortirr/releases).
2. **Buka aplikasi** dengan double-click.
3. **Pindahkan file** yang ingin disortir ke folder `dump`:
   - Anda bisa klik menu **File -> Buka Folder Dump** di menu bar atas, lalu *copy-paste* file ke sana.
   - Atau langsung **Drag & Drop** file ke jendela aplikasi Sortirr.
4. **Sortir instan**: Tekan tombol <kbd>1</kbd> sampai <kbd>6</kbd> pada keyboard Anda untuk memindahkan file ke kategori yang sesuai!

> [!TIP]
> **Lokasi Penyimpanan Data:**
> - **Versi Installer:** Data sortir, folder `dump`, dan konfigurasi disimpan di folder: `Dokumen/Sortirr/`.
> - **Versi Portable:** Data disimpan mandiri di folder `Sortirr-Data/` persis di samping file `.exe`.
> - Data Anda aman dan tidak akan terhapus saat aplikasi diperbarui.

---

## ✨ Fitur-Fitur Utama

Sortirr dirancang khusus untuk memangkas waktu pengorganisasian file dalam jumlah besar dengan alur kerja yang sangat responsif:

### 1. Fast Single-Key Sorting & Pintasan Cepat
- **Sortir 1 Ketukan**: Tekan tombol angka (<kbd>1</kbd>–<kbd>6</kbd>) atau tombol huruf apa pun untuk langsung memindahkan file ke folder tujuan.
- **Hapus Aman**: Tombol <kbd>Del</kbd> atau <kbd>Backspace</kbd> memindahkan berkas ke folder `.trash` (tidak langsung hilang permanen).
- **Undo Penuh (<kbd>Ctrl + Z</kbd>)**: Riwayat pembatalan hingga 50 aksi terakhir untuk mengembalikan file yang salah dipindahkan atau tidak sengaja terhapus.
- **Skip & Previous**: Tombol <kbd>S</kbd> untuk melewati file ke antrean belakang, dan tombol <kbd>P</kbd> untuk kembali ke file sebelumnya.

### 2. Universal Media & File Preview Engine
- **Foto & Gambar**: Mendukung format umum (`JPG`, `PNG`, `WebP`, `GIF`, `SVG`, `BMP`, `AVIF`) serta format Apple (`HEIC`/`HEIF`) langsung tanpa plugin tambahan.
- **Kontrol Gambar**: Zoom In/Out, Rotate 90° (<kbd>R</kbd>), Flip Horizontal, dan Fullscreen Lightbox (<kbd>F</kbd> atau Double Click).
- **Pemutar Video Terintegrasi (FFmpeg)**: Transkoding background otomatis untuk format video kamera (`MOV`, `MKV`, `MP4`, `AVI`, `WebM`, `FLV`, `WMV`, `3GP`, `TS`) dengan *seeking* cepat dan pembuatan *thumbnail poster* instan.
- **Audio Visualizer**: Pemutar audio interaktif (`MP3`, `WAV`, `OGG`, `FLAC`, `M4A`, `AAC`) dengan animasi gelombang visualizer.
- **Dokumen Teks & Kode**: Preview instan dengan nomor baris dan tombol salin (`.txt`, `.md`, `.json`, `.js`, `.py`, `.sql`, `.env`, dll.).
- **PDF & Dokumen Kantor**: Penampil PDF terintegrasi dan kartu info file biner/arsip (`.zip`, `.rar`).

### 3. Kategori Default Profesional & Kustomisasi Fleksibel
Aplikasi hadir dengan konfigurasi default yang bersih dan terstandar:

| Tombol Pintasan | Kategori Folder | Warna Badge | Penggunaan |
| :---: | :--- | :---: | :--- |
| <kbd>1</kbd> | **`Work`** | `#6366f1` (Indigo) | Materi kerja, proyek, tugas, aset bisnis |
| <kbd>2</kbd> | **`Personal`** | `#06b6d4` (Cyan) | Foto/dokumen pribadi, keluarga, hobi |
| <kbd>3</kbd> | **`Media`** | `#10b981` (Emerald) | Koleksi foto umum, video, grafik, musik |
| <kbd>4</kbd> | **`Documents`** | `#f59e0b` (Amber) | Laporan, invoice, tagihan, struk, PDF resmi |
| <kbd>5</kbd> | **`Archive`** | `#8b5cf6` (Purple) | Cadangan (*backup*), arsip lama |
| <kbd>6</kbd> | **`Review`** | `#ec4899` (Rose) | File yang butuh ditinjau ulang kemudian |

*Aturan folder, nama, tombol, dan warna badge dapat ditambah, diubah, atau dihapus secara bebas melalui menu modal **Rules**.*

### 4. Antarmuka Modern & Audio Feedback
- **Dark Glassmorphic UI**: Tampilan elegan berpalet gelap yang nyaman di mata saat menyortir ribuan file dalam durasi lama.
- **Queue Filmstrip Carousel**: Bilah thumbnail interaktif di bagian bawah; klik item untuk langsung melompat ke file tersebut dalam antrean.
- **Synthetic Sound FX**: Efek audio taktil berbasis Web Audio API yang memberikan feedback saat file dipindahkan, dihapus, atau di-undo (dapat dibisukan dengan tombol toggle).

---

## ⌨️ Daftar Pintasan Keyboard (Hotkey Cheat Sheet)

| Pintasan Keyboard | Aksi / Fungsi |
| :--- | :--- |
| **`1` s/d `9` (atau huruf)** | Pindahkan file aktif ke folder tujuan yang sesuai |
| **`Del` / `Backspace`** | Hapus file aktif (dapat dibatalkan via Undo) |
| **`Ctrl + Z`** | **Undo** aksi pemindahan atau penghapusan terakhir |
| **`S`** | **Skip**: Lewati file saat ini ke akhir antrean |
| **`P`** | **Previous**: Kembali ke file yang baru dilewati |
| **`Space`** | **Play / Pause** pemutaran video atau audio |
| **`F`** | Buka / Tutup gambar dalam mode **Fullscreen Lightbox** |
| **`R`** | Putar gambar searah jarum jam (*Rotate 90°*) |
| **`Esc`** | Menutup modal aktif atau Lightbox |

---

## 💻 Panduan Pengembang (Development & Self-Hosted)

Bagi pengembang yang ingin menjalankan dari *source code* atau berkontribusi pada pengembangan:

### 1. Persyaratan Sistem
- **Node.js** versi 18.0.0 atau yang lebih baru
- **npm** (Node Package Manager)
- OS: Windows 10/11, macOS, atau Linux

### 2. Instalasi
```bash
git clone https://github.com/satriaksm/sortirr.git
cd sortirr
npm install
```

### 3. Menjalankan Aplikasi
- **Mode Desktop App (Electron):**
  ```bash
  npm run desktop
  ```
- **Mode Web Self-Hosted (Browser):**
  ```bash
  npm start
  ```
  *Buka [http://localhost:3000](http://localhost:3000) di browser Anda.*

### 4. Membangun Executable Windows (.exe) Mandiri
```bash
npm run dist
```
*File `Sortirr Setup 1.0.0.exe` dan `Sortirr-1.0.0-Portable.exe` akan terbuat secara otomatis di dalam folder `dist/`.*

---

## 📁 Struktur Direktori Proyek

```text
sortirr/
├── .github/
│   └── workflows/
│       └── release.yml     # Workflow GitHub Actions otomatisasi build & release .exe
├── build/
│   ├── icon.ico            # Ikon multi-resolusi Windows desktop & installer
│   └── icon.png            # Ikon resolusi tinggi (256x256)
├── dist/                   # Direktori output kompilasi installer & portable .exe
├── main.js                 # Entry point Electron desktop app & process lifecycle
├── moveFile.js             # Modul pemindahan berkas aman dengan resolusi tabrakan nama
├── package.json            # Konfigurasi dependensi, scripts, dan electron-builder
├── config.json             # Konfigurasi tombol pintasan dan folder kategori default
├── server.js               # Express server, REST API, upload handler & worker FFmpeg
├── README.md               # Dokumentasi proyek
└── public/
    ├── index.html          # Antarmuka reaktif glassmorphic Sortirr
    └── favicon.svg         # Favicon logo vektor
```

---

## 📄 Lisensi

Proyek ini dirilis dan didistribusikan di bawah lisensi [MIT](LICENSE).
