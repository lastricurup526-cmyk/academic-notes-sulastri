# Academic Notes — Personal Academic Space

Website catatan akademik untuk satu mata kuliah, dibuat menggunakan HTML, CSS, dan JavaScript.

## Cara menjalankan di VS Code
1. Ekstrak ZIP ini.
2. Buka folder `academic-notes` di VS Code.
3. Masukkan foto ke folder `assets` (panduan ada di `assets/README.txt`).
4. Pasang ekstensi **Live Server** jika belum ada.
5. Klik kanan `index.html` → **Open with Live Server**.

## Mengatur foto langsung dari VS Code
Tidak ada tombol upload foto di website. Foto dibaca langsung dari folder `assets`:
- `assets/profil.jpg` untuk foto profil mahasiswa.
- `assets/background.jpg` untuk foto latar bagian atas.

Gunakan nama file persis seperti di atas. Jika gambar tidak ditemukan, website akan menampilkan warna latar atau inisial nama sebagai pengganti.

## Fitur
- Profil mahasiswa: nama, NPM, program studi, fakultas, universitas.
- Nama dan deskripsi mata kuliah dapat diedit dari tombol **Edit profil & foto** (foto diatur di VS Code).
- Catatan per submateri, pencarian, kategori, favorit, dan edit/hapus.
- Editor teks dasar: heading, tebal, miring, garis bawah, daftar, tautan, dan kutipan.
- Referensi jurnal, artikel, buku, DOI, dan URL.
- Penyimpanan catatan dan profil pada `localStorage` browser.

## Catatan penyimpanan
Data catatan disimpan di browser/perangkat yang digunakan. Menghapus data situs atau menggunakan browser/perangkat berbeda dapat membuat data tidak tersedia.

## Menyesuaikan teks dan tampilan
- Warna, jarak, dan layout: `style.css`.
- Isi halaman dan teks caption: `index.html`.
- Perilaku website dan nama file foto: `script.js`.
