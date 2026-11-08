// Penyusun konteks untuk /api/chat: validasi payload, deteksi tanggal & kata krisis,
// dan blok tambahan pesan sistem. Semua hitungan primbon berasal dari calc.mjs.
import { weton, shio, zodiak, validDate } from "./calc.mjs";

export const MAX_MESSAGES = 20;
export const MAX_CHARS = 2000;
export const MAX_DATES = 3;
export const MODES = ["CEPAT", "LENGKAP"];

// Penyaring sederhana, bukan pengganti protokol krisis di prompt.
// Daftar yang sama ada di public/app.js (CRISIS_WORDS) agar kartu krisis tetap tampil walau function gagal.
export const CRISIS_WORDS = [
  "bunuh diri", "mengakhiri hidup", "ingin mati", "pengen mati", "mau mati",
  "tidak ingin hidup", "gak mau hidup", "capek hidup", "lebih baik aku mati",
  "menghilang dari dunia", "menyakiti diri", "melukai diri", "self harm", "overdosis",
];

const BULAN = {
  januari: 1, jan: 1, februari: 2, pebruari: 2, feb: 2, maret: 3, mar: 3, april: 4, apr: 4,
  mei: 5, juni: 6, jun: 6, juli: 7, jul: 7, agustus: 8, agu: 8, agt: 8, ags: 8,
  september: 9, sep: 9, sept: 9, oktober: 10, okt: 10, november: 11, nov: 11, nopember: 11,
  desember: 12, des: 12,
};

const normalize = (s) => s.toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");

export function isCrisis(text) {
  const t = normalize(String(text || ""));
  return CRISIS_WORDS.some((w) => t.includes(w));
}

const pad = (n) => String(n).padStart(2, "0");
const fmt = (y, m, d) => `${pad(d)}-${pad(m)}-${y}`;

/** Cari tanggal DD-MM-YYYY, DD/MM/YYYY, atau "17 Agustus 1995" (maks 3, urut kemunculan). */
export function extractDates(text) {
  const found = [];
  const s = String(text || "");
  const numeric = /\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/g;
  const named = new RegExp(`\\b(\\d{1,2})\\s+(${Object.keys(BULAN).join("|")})\\.?\\s+(\\d{4})\\b`, "gi");
  for (const m of s.matchAll(numeric)) found.push({ i: m.index, raw: m[0], d: +m[1], m: +m[2], y: +m[3] });
  for (const m of s.matchAll(named)) found.push({ i: m.index, raw: m[0], d: +m[1], m: BULAN[m[2].toLowerCase()], y: +m[3] });
  found.sort((a, b) => a.i - b.i);
  return found.slice(0, MAX_DATES).map(({ raw, y, m, d }) => ({ raw, y, m, d, valid: validDate(y, m, d) }));
}

/** Ringkasan hitungan satu tanggal sebagai teks untuk blok [DATA_TERHITUNG]. */
export function describeDate(label, y, m, d) {
  if (!validDate(y, m, d)) return `- ${label}: TANGGAL TIDAK VALID, tolak dan minta tanggal yang benar.`;
  const w = weton(y, m, d);
  const s = shio(y, m, d);
  const z = zodiak(m, d);
  const shioTxt = s
    ? `shio ${s.hewan} ${s.elemen} (tahun shio ${s.tahunShio}; dekatImlek=${s.dekatImlek})`
    : "shio: tahun di luar tabel 1990-2030, katakan tidak yakin";
  return `- ${label} ${fmt(y, m, d)}: weton ${w.hari} ${w.pasaran}, neptu ${w.neptu}; ${shioTxt}; zodiak ${z.tanda} (elemen ${z.elemen}; dekatBatas=${z.dekatBatas})`;
}

const bad = (error) => ({ ok: false, error });

/** Validasi ketat payload. Mengembalikan {ok:true, value} atau {ok:false, error}. */
export function validatePayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return bad("Format permintaan tidak dikenali.");
  const keys = Object.keys(body);
  if (keys.some((k) => !["messages", "profile", "mode"].includes(k))) return bad("Permintaan berisi data yang tidak dikenal.");
  const { messages, profile = null, mode } = body;

  if (!MODES.includes(mode)) return bad("Mode harus CEPAT atau LENGKAP.");
  if (!Array.isArray(messages) || messages.length === 0) return bad("Pesan tidak boleh kosong.");
  if (messages.length > MAX_MESSAGES) return bad(`Maksimal ${MAX_MESSAGES} pesan terakhir.`);
  for (const msg of messages) {
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) return bad("Format pesan tidak dikenali.");
    if (Object.keys(msg).some((k) => !["role", "content"].includes(k))) return bad("Format pesan tidak dikenali.");
    if (msg.role !== "user" && msg.role !== "assistant") return bad("Peran pesan hanya boleh user atau assistant.");
    if (typeof msg.content !== "string" || !msg.content.trim()) return bad("Isi pesan harus berupa teks.");
    if (msg.content.length > MAX_CHARS) return bad(`Setiap pesan maksimal ${MAX_CHARS} karakter.`);
  }
  if (messages[messages.length - 1].role !== "user") return bad("Pesan terakhir harus dari pengguna.");

  let nama = "";
  let tgl = null;
  if (profile !== null) {
    if (typeof profile !== "object" || Array.isArray(profile)) return bad("Format profil tidak dikenali.");
    if (Object.keys(profile).some((k) => !["nama", "tgl"].includes(k))) return bad("Profil berisi data yang tidak dikenal.");
    if (profile.nama != null && typeof profile.nama !== "string") return bad("Nama harus berupa teks.");
    nama = (profile.nama || "").replace(/[\[\]\r\n\t]/g, " ").replace(/\s+/g, " ").trim();
    if (nama.length > 40) return bad("Nama panggilan maksimal 40 karakter.");
    if (profile.tgl != null) {
      const m = typeof profile.tgl === "string" && /^(\d{4})-(\d{2})-(\d{2})$/.exec(profile.tgl);
      if (!m || !validDate(+m[1], +m[2], +m[3])) return bad("Tanggal lahir tidak valid (format YYYY-MM-DD).");
      tgl = { y: +m[1], m: +m[2], d: +m[3] };
    }
  }

  // Normalisasi untuk API: buang balasan asisten di awal, gabungkan peran yang berurutan.
  const clean = [];
  for (const { role, content } of messages) {
    if (!clean.length && role === "assistant") continue;
    const last = clean[clean.length - 1];
    if (last && last.role === role) last.content += "\n\n" + content;
    else clean.push({ role, content });
  }
  return { ok: true, value: { messages: clean, nama, tgl, mode } };
}

/** Blok tambahan yang ditempel setelah master prompt. */
export function buildContextBlocks({ messages, nama, tgl, mode }) {
  const lastUser = messages[messages.length - 1].content;
  const lines = [];
  lines.push("[PROFIL]");
  lines.push(`nama panggilan: ${nama || "dilewati"}`);
  lines.push(`tanggal lahir: ${tgl ? fmt(tgl.y, tgl.m, tgl.d) : "dilewati"}`);
  lines.push("");
  lines.push("[MODE]");
  lines.push(mode);
  lines.push("");
  lines.push("[DATA_TERHITUNG]");
  const data = [];
  if (tgl) data.push(describeDate("tanggal lahir profil", tgl.y, tgl.m, tgl.d));
  for (const dt of extractDates(lastUser)) {
    data.push(describeDate(`tanggal di pesan ("${dt.raw}")`, dt.y, dt.m, dt.d));
  }
  lines.push(data.length ? data.join("\n") : "- (tidak ada tanggal)");
  const crisis = isCrisis(lastUser);
  if (crisis) {
    lines.push("");
    lines.push("[MODE_KRISIS]");
    lines.push("Pesan terakhir mengandung tanda krisis. Ikuti PROTOKOL KRISIS sepenuhnya. Jangan meramal, jangan bercanda.");
  }
  return { text: lines.join("\n"), crisis };
}
