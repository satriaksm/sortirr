# Sortirr — Smart Universal Media & File Sorter

**Sortirr** adalah aplikasi web produktivitas yang dirancang untuk mengorganisasi dan memilah ribuan file lokal (foto, video, audio, dokumen, dan kode) secara instan ke dalam direktori tujuan yang terstruktur melalui antarmuka modern berestetika *dark glassmorphism* dan kontrol *single-key keyboard shortcut*, dibangun menggunakan arsitektur backend **Node.js** dan **Express.js**, engine transcoding **FFmpeg** (`ffmpeg-static`) untuk streaming video performa tinggi dan pembuatan *thumbnail* instan, middleware **Multer** untuk pengunggahan berkas batch, serta antarmuka frontend reaktif berbasis **HTML5**, **Modern Vanilla CSS** (dengan CSS custom properties, micro-animations, dan tata letak responsif), **Vanilla JavaScript ES6+**, library **heic2any** untuk konversi format Apple HEIC/HEIF langsung di sisi klien, serta **Web Audio API** untuk *real-time synthetic sound feedback*.

---

## Fitur Utama

Sortirr dilengkapi dengan berbagai fitur produktivitas tingkat lanjut yang dirancang untuk mempercepat alur kerja pemilihan dan penyortiran media dalam jumlah besar:

### 1. Fast Single-Key Sorting & Pintasan Keyboard
- Pindahkan berkas ke folder tujuan hanya dengan **1 ketukan tombol** keyboard (misal: tombol `1` sampai `9` atau huruf apa pun).
- Tombol `Del` atau `Backspace` untuk memindahkan berkas ke tempat sampah aman (*safe recycle buffer*).
- Tombol `S` (*Skip*) untuk melewati file saat ini ke antrean belakang, dan tombol `P` (*Previous*) untuk kembali ke file sebelumnya.
- Tombol `Space` untuk memulai/menghentikan pemutaran video dan audio secara instan.

### 2. Full Undo System (Ctrl + Z)
- Fitur pembatalan aksi (*Undo*) hingga 50 riwayat terakhir.
- Mengembalikan berkas yang tidak sengaja dipindahkan langsung kembali ke folder `dump/`.
- Memulihkan berkas yang baru dihapus dari direktori `.trash` tanpa kehilangan data.

### 3. Universal Media & File Previews
- **Gambar & Foto**: Mendukung format standar (`PNG`, `JPG`, `WebP`, `GIF`, `SVG`, `BMP`, `AVIF`) dan format Apple (`HEIC`/`HEIF`) dengan rendering otomatis.
- **Image Controls**: Fitur *Zoom In/Out*, *Rotate 90°*, *Flip Horizontal*, *Reset*, dan *Fullscreen Lightbox* (tombol `F` atau *Double Click*).
- **Video Player Cerdas**: Pratinjau video universal (`MP4`, `MKV`, `MOV`, `AVI`, `WebM`, `FLV`, `WMV`, `3GP`, `TS`) dengan transkoding latar belakang berkecepatan tinggi via FFmpeg ke H.264 FastStart MP4 dan poster thumbnail otomatis.
- **Audio Visualizer**: Pemutar audio interaktif (`MP3`, `WAV`, `OGG`, `FLAC`, `M4A`, `AAC`) dengan animasi *orb pulse visualizer*.
- **Dokumen Teks & Kode Sumber**: Tampilan teks monospace dengan nomor baris dan tombol *Copy to Clipboard* (`.js`, `.py`, `.json`, `.md`, `.sql`, `.env`, `.csv`, `.yml`, dll.).
- **PDF & Office Docs**: Penampil dokumen PDF tersemat (*embedded*) serta kartu aksi langsung untuk membuka atau mengunduh arsip zip/rar dan dokumen biner.

### 4. Drag & Drop Upload & Antrean Interaktif
- Seret (*drag & drop*) berkas langsung dari file manager OS ke jendela browser untuk menambahkan file baru ke antrean `dump/`.
- Modal pengunggahan file batch dengan progress bar real-time.
- **Queue Filmstrip Carousel**: Bilah antrean bawah yang menampilkan daftar 12 file berikutnya; klik pada item untuk langsung melompat ke file tersebut.

### 5. Kustomisasi Folder & Aturan Shortcut Dinamis
- Ubah, tambah, atau hapus aturan folder dan tombol pintasan langsung melalui UI modal pengaturan (*Rules*).
- Kustomisasi warna badge masing-masing folder untuk identifikasi visual yang intuitif.
- Perubahan disimpan otomatis ke `config.json` dan folder tujuan di `public/` dibuat secara otomatis jika belum ada.

### 6. Integrasi OS File Explorer
- Tombol 1-klik untuk langsung membuka folder `dump` atau folder tujuan apa pun di Windows File Explorer (`explorer.exe`) / macOS Finder / Linux file manager.

### 7. Synthetic Sound FX Engine
- Efek suara taktil yang disintesis langsung menggunakan Web Audio API saat memindahkan file, menghapus, undo, atau skip (tanpa memerlukan aset file audio eksternal).
- Tombol toggle untuk mengaktifkan atau membisukan audio kapan saja dengan preferensi tersimpan di `localStorage`.

### 8. Statistik Sesi & Progress Bar Real-time
- Indikator progres penyortiran dan counter file tersisa.
- Modal statistik komprehensif yang menampilkan jumlah file dan penggunaan kapasitas disk per folder tujuan.

---

## Daftar Pintasan Keyboard (Hotkey Cheat Sheet)

| Pintasan Keyboard | Aksi / Fungsi |
| :--- | :--- |
| **`1` s/d `9` (atau huruf)** | Pindahkan file aktif ke folder tujuan yang sesuai |
| **`Del` / `Backspace`** | Hapus file aktif (dapat dibatalkan via Undo) |
| **`Ctrl + Z` / `Cmd + Z`** | **Undo** aksi pemindahan atau penghapusan terakhir |
| **`S`** | **Skip**: Lewati file saat ini ke akhir antrean |
| **`P`** | **Previous**: Kembali ke file yang baru dilewati |
| **`Space`** | **Play / Pause** pemutaran video atau audio |
| **`F`** | Buka/Tutup gambar dalam mode **Fullscreen Lightbox** |
| **`R`** | Putar gambar searah jarum jam (*Rotate 90°*) |
| **`Esc`** | Menutup modal aktif atau Lightbox |

---

## ⚡ Unduh Aplikasi Windows Desktop (.exe)

Bagi pengguna umum di sistem operasi Windows, Anda **tidak perlu** menginstal Node.js, Git, Laragon, maupun membuka terminal. Anda dapat langsung mengunduh file aplikasi siap pakai dari halaman [GitHub Releases](https://github.com/satriaksm/sortirr/releases):

| Format Rilis | Deskripsi | Rekomendasi Penggunaan |
| :--- | :--- | :--- |
| **`Sortirr-Setup-1.0.0.exe`** | **Installer Resmi Windows** lengkap dengan wizard instalasi, shortcut Desktop, Start Menu, dan uninstaller. | Untuk pemakaian sehari-hari di PC / Laptop utama Anda. |
| **`Sortirr-1.0.0-Portable.exe`** | **Versi Portable (Standalone)**, langsung klik dan jalan tanpa instalasi. | Praktis dibawa di flashdisk/harddisk eksternal dan bisa dipakai di komputer mana saja. |

> [!TIP]
> **Lokasi Penyimpanan Data:**
> - **Versi Installer:** Data sortir, folder `dump`, dan konfigurasi disimpan di folder aman: `Dokumen/Sortirr/`.
> - **Versi Portable:** Data disimpan di dalam folder `Sortirr-Data/` di samping file executable Portable tersebut.
> - Anda dapat membuka folder data dan folder dump kapan saja langsung dari menu aplikasi (**File -> Buka Folder Dump**).

---

## Persyaratan Sistem (Untuk Pengembang / Self-Hosted)

- **Node.js** versi 18.0.0 atau yang lebih baru
- **npm** (Node Package Manager)
- Sistem Operasi: Windows 10/11, macOS, atau Linux

---

## Instalasi & Menjalankan (Mode Pengembang)

1. **Clone repositori ini:**
   ```bash
   git clone https://github.com/satriaksm/sortirr.git
   cd sortirr
   ```

2. **Instal dependensi:**
   ```bash
   npm install
   ```

3. **Jalankan Aplikasi:**
   - **Mode Desktop App (Electron):**
     ```bash
     npm run desktop
     ```
   - **Mode Web Self-Hosted (Browser):**
     ```bash
     npm start
     ```
     Lalu buka [http://localhost:3000](http://localhost:3000) di browser Anda.

4. **Build Executable Windows (.exe):**
   ```bash
   npm run dist
   ```
   *Hasil kompilasi (`Sortirr Setup 1.0.0.exe` dan `Sortirr-1.0.0-Portable.exe`) akan otomatis tersimpan di folder `dist/`.*

---

## Struktur Direktori Proyek

```text
sortirr/
├── .cache/              # Cache transkoding video dan thumbnail poster FFmpeg
├── .trash/              # Buffer penampungan berkas terhapus untuk fitur Undo
├── config.json          # Konfigurasi tombol pintasan dan direktori folder tujuan
├── moveFile.js          # Modul pemindahan berkas dengan proteksi tabrakan nama file
├── package.json         # Konfigurasi dependensi proyek
├── public/              # Direktori statis dan folder tujuan sortir
│   ├── dump/            # Direktori sumber berkas yang akan disortir
│   ├── favicon.svg      # Favicon vektor aplikasi Sortirr
│   ├── index.html       # Antarmuka web glassmorphic responsif Sortirr
│   ├── Family/          # Contoh folder tujuan sortir
│   └── ...              # Folder dinamis lainnya
├── README.md            # Dokumentasi lengkap proyek
└── server.js            # Express server, API endpoints, FFmpeg worker, & upload handler
```

---

## Lisensi

Proyek ini dilisensikan di bawah lisensi [MIT](LICENSE).


