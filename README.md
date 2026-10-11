# Portofolio + Blog Fandy (Netlify)

## Struktur
- `public/` : seluruh situs statis (dipublikasikan Netlify)
  - `index.html`, `blog.html`, `post.html`: halaman portofolio, daftar blog, dan artikel
  - `js/blog.js`: mengambil tulisan dari `/api/posts` dan merendernya
  - `admin/`: panel admin di `/admin/`
  - `data/posts.json`: data awal. Hanya dipakai sekali untuk mengisi penyimpanan saat pertama kali dijalankan.
- `netlify/functions/`: backend
  - `posts.mjs`: `GET /api/posts`, publik, tanpa draft
  - `media.mjs`: `GET /api/media/*`, publik, mengirim gambar yang diunggah
  - `admin.mjs`: `/api/admin/*`, login, sesi, simpan, hapus, unggah
- `netlify/lib/shared.mjs`: autentikasi, validasi, dan penyimpanan
- `netlify.toml`: konfigurasi build

Tulisan dan gambar yang diunggah disimpan di **Netlify Blobs** (store `blog` dan `media`), bukan di file repositori. Dengan begitu perubahan dari panel langsung terlihat tanpa rebuild.

## Setup di Netlify
1. Push folder ini ke GitHub, lalu hubungkan repositori di Netlify (Add new site > Import an existing project).
2. Di **Site configuration > Environment variables**, tambahkan:
   - `ADMIN_PASSWORD`: password untuk masuk ke `/admin/`
   - `SESSION_SECRET`: string acak panjang, misalnya hasil dari `openssl rand -hex 32`
3. Deploy. Buka `https://domainmu.netlify.app/admin/` lalu masuk.

Blobs dan Functions sudah aktif otomatis di Netlify. Tidak perlu pengaturan tambahan.

## Menjalankan di komputer
    npm install
    npx netlify dev

`netlify dev` menjalankan situs dan function di `http://localhost:8888`. Untuk uji lokal, buat file `.env` di root berisi `ADMIN_PASSWORD` dan `SESSION_SECRET`, lalu Netlify CLI akan memakainya.

## Catatan
- Tulisan contoh di `data/posts.json` akan masuk ke penyimpanan saat pertama kali diakses. Hapus dari panel kalau tidak diperlukan.
- Setelah itu, `data/posts.json` tidak lagi dipakai. Perubahan dilakukan lewat panel.
- Gambar maksimal 3 MB (JPG, PNG, atau WEBP). Batas ini ditetapkan karena body function maksimal 6 MB.
- Penyimpanan memakai read-modify-write sederhana. Jika dua orang menyimpan tulisan di waktu yang sama, perubahan terakhir bisa menimpa yang lain. Untuk pemakaian tunggal ini tidak masalah.
- Verifikasi Google (`googlec83f2b2139e80591.html`) tetap ada di `public/`.
