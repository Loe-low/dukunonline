# AGENTS.md — Mbah Wening

## Arsitektur
- Situs statis tanpa build di `public/` (publish dir). Satu Netlify Function v2 (`export default async (req) => Response`) di `netlify/functions/chat.mjs`, path `/api/chat`, hanya POST.
- Function: validasi ketat payload (`lib/context.mjs`) → susun pesan sistem = isi `prompts/mbah-wening.md` + blok `[PROFIL]`, `[MODE]`, `[DATA_TERHITUNG]`, dan `[MODE_KRISIS]` (jika ada kata krisis) → panggil Anthropic via Netlify AI Gateway (`new Anthropic()` tanpa key) dengan streaming → kirim SSE ke klien.
- Format SSE: `data: {"crisis":bool}` di awal, lalu `{"t":"teks"}` berulang, `{"error":"pesan ramah"}` bila gagal, `{"done":true}` di akhir.
- Klien (`public/app.js`) menyimpan state di `sessionStorage` (`mbah-wening:v1`). Pesan bertanda `local:true` (sapaan statis, pesan error) tidak dikirim ke model.

## Aturan yang tidak boleh dilanggar
- **Rumus di `lib/calc.mjs` jangan diubah.** Tes di `calc.test.mjs` adalah titik uji dari pemilik produk.
- **Jangan hapus/lemahkan** protokol krisis dan batas peran di `prompts/mbah-wening.md`. File itu disalin persis dari brief pemilik.
- **Dilarang `console.log`** isi pesan, nama, atau tanggal lahir. Log error hanya status/nama error.
- Hitungan primbon selalu oleh kode, bukan model.
- Tanpa database/penyimpanan server.

## Keputusan yang tidak terlihat jelas
- `public/` dipakai sebagai publish dir supaya `prompts/` dan kode function tidak bisa diunduh sebagai file statis.
- Daftar kata krisis ada di DUA tempat: `CRISIS_WORDS` di `lib/context.mjs` dan di `public/app.js` (klien tidak bisa mengimpor kode function). Ubah keduanya bersamaan.
- Daftar menu chip: konstanta `MENU` di `public/app.js`.
- Rate limit dideklarasikan di `config.rateLimit` function (15/60 detik, `aggregateBy: ["ip","domain"]`); tidak bisa diatur di `netlify.toml`. Netlify mengembalikan 429, klien menampilkan pesan ramah.
- Model dari env `MODEL`, default `claude-sonnet-5-5`; `max_tokens` 700.
- Pesan diubah sebelum dikirim ke API: balasan asisten di awal dibuang dan peran yang berurutan digabung.

## Tes
`npm test` (= `node --test`) menjalankan `netlify/functions/lib/*.test.mjs`. Folder `lib/` tidak punya `lib.mjs`/`index.mjs`, jadi Netlify tidak menganggapnya function.
