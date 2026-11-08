// Mbah Wening — front-end tanpa framework. Semua data hanya di sessionStorage.
"use strict";

/* ===== Daftar menu: ubah di sini saja. label = teks chip, pesan = pesan yang dikirim otomatis. ===== */
const MENU = [
  { label: "📜 Weton & Watak", pesan: "Mbah, tolong lihat weton dan watakku." },
  { label: "💞 Kecocokan Jodoh", pesan: "Mbah, aku mau cek kecocokan jodoh." },
  { label: "🔤 Arti Nama", pesan: "Mbah, tolong artikan namaku." },
  { label: "🌙 Tafsir Mimpi", pesan: "Mbah, aku mau cerita mimpiku semalam." },
  { label: "📅 Hari Baik", pesan: "Mbah, aku mau cari hari baik untuk sebuah hajat." },
  { label: "🐉 Zodiak & Shio", pesan: "Mbah, apa zodiak dan shioku?" },
  { label: "🍀 Peruntungan", pesan: "Mbah, bagaimana peruntunganku bulan ini?" },
  { label: "☕ Teman Cerita", pesan: "Mbah, aku lagi pengen curhat." },
];

/* Sama dengan CRISIS_WORDS di netlify/functions/lib/context.mjs — kartu krisis tetap tampil walau function gagal. */
const CRISIS_WORDS = [
  "bunuh diri", "mengakhiri hidup", "ingin mati", "pengen mati", "mau mati",
  "tidak ingin hidup", "gak mau hidup", "capek hidup", "lebih baik aku mati",
  "menghilang dari dunia", "menyakiti diri", "melukai diri", "self harm", "overdosis",
];

const OPENING =
  "Wah, ada tamu! Mbah Wening di sini 🌾 spesialis weton, mimpi, dan curhat tanpa antre. " +
  "Kenalan dulu ya, Nak: siapa nama panggilanmu dan kapan lahirmu (DD-MM-YYYY)? " +
  "Kalau belum mau kasih tanggal lahir, ndak papa, kita tetap bisa ngobrol.";
const FRIENDLY_ERROR = "Mbah lagi istirahat sebentar, coba lagi nanti ya 🌾";
const RATE_LIMITED = "Pelan-pelan, Nak, Mbah ndak bisa secepat itu. Tunggu sekitar satu menit lalu kirim lagi ya 🌾";
const STORE_KEY = "mbah-wening:v1";
const MAX_MESSAGES = 20;
const MAX_CHARS = 2000;

/* ===== State ===== */
const freshState = () => ({ started: false, profile: null, mode: "LENGKAP", messages: [] });
let state = load();
let busy = false;

function load() {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    return raw ? { ...freshState(), ...JSON.parse(raw) } : freshState();
  } catch {
    return freshState();
  }
}
function save() {
  try { sessionStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* penyimpanan penuh/nonaktif */ }
}

/* ===== Util ===== */
const $ = (sel) => document.querySelector(sel);
const isCrisis = (text) => {
  const t = String(text || "").toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
  return CRISIS_WORDS.some((w) => t.includes(w));
};
const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function renderText(text) {
  const html = escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, "$1<em>$2</em>");
  return html
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}
const ddmmyyyy = (iso) => iso.split("-").reverse().join("-");

/* ===== Elemen ===== */
const welcome = $("#welcome");
const chat = $("#chat");
const log = $("#log");
const input = $("#input");
const sendBtn = $("#send");
const chipsNav = $("#chips");
const crisisTpl = $("#crisis-tpl");

/* ===== Render ===== */
function bubbleEl(msg) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${msg.role}${msg.notice ? " notice" : ""}`;
  const who = document.createElement("span");
  who.className = "who";
  who.textContent = msg.role === "user" ? state.profile?.nama || "Kamu" : "Mbah Wening";
  const b = document.createElement("div");
  b.className = "bubble";
  if (msg.pending && !msg.content) {
    b.innerHTML = '<span class="dots" aria-label="Mbah sedang mengetik"><i></i><i></i><i></i></span>';
  } else {
    b.innerHTML = renderText(msg.content);
    if (msg.pending) b.classList.add("typing");
  }
  wrap.append(who, b);
  if (msg.crisis) wrap.append(crisisTpl.content.cloneNode(true));
  return wrap;
}
function renderAll() {
  log.replaceChildren(...state.messages.map(bubbleEl));
  scrollDown();
}
function updateLast() {
  const last = state.messages[state.messages.length - 1];
  const el = log.lastElementChild;
  if (el) el.replaceWith(bubbleEl(last));
  else log.append(bubbleEl(last));
  scrollDown();
}
function scrollDown() { log.scrollTop = log.scrollHeight; }

function renderChips() {
  chipsNav.replaceChildren(
    ...MENU.map((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.textContent = item.label;
      btn.addEventListener("click", () => send(item.pesan));
      return btn;
    })
  );
}
function renderMode() {
  document.querySelectorAll(".mode button").forEach((b) => {
    b.setAttribute("aria-checked", String(b.dataset.mode === state.mode));
  });
}
function setBusy(v) {
  busy = v;
  sendBtn.disabled = v;
  chipsNav.querySelectorAll("button").forEach((b) => (b.disabled = v));
  log.setAttribute("aria-busy", String(v));
}
function showScreen() {
  welcome.hidden = state.started;
  chat.hidden = !state.started;
  if (state.started) {
    renderMode();
    renderAll();
  }
}

/* ===== Kirim & streaming ===== */
function apiMessages() {
  return state.messages
    .filter((m) => !m.local && !m.pending && m.content.trim())
    .slice(-MAX_MESSAGES)
    .map(({ role, content }) => ({ role, content: content.slice(0, MAX_CHARS) }));
}

async function send(text) {
  text = String(text || "").trim();
  if (!text || busy) return;
  if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);

  const crisis = isCrisis(text);
  state.messages.push({ role: "user", content: text });
  const reply = { role: "assistant", content: "", pending: true, crisis };
  state.messages.push(reply);
  save();
  renderAll();
  setBusy(true);

  let frame = 0;
  const paint = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; updateLast(); });
  };

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: apiMessages(), profile: state.profile, mode: state.mode }),
    });

    if (res.status === 429) throw Object.assign(new Error("rate"), { friendly: RATE_LIMITED });
    if (res.status === 400) {
      const j = await res.json().catch(() => ({}));
      throw Object.assign(new Error("bad"), { friendly: j.error || FRIENDLY_ERROR });
    }
    if (!res.ok || !res.body) throw new Error("http");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let failed = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) !== -1) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 2);
        if (!line.startsWith("data:")) continue;
        let ev;
        try { ev = JSON.parse(line.slice(5)); } catch { continue; }
        if (ev.crisis) reply.crisis = true;
        if (typeof ev.t === "string") { reply.content += ev.t; paint(); }
        if (ev.error) failed = ev.error;
      }
    }
    if (failed && !reply.content) throw Object.assign(new Error("model"), { friendly: failed });
    if (!reply.content) throw new Error("empty");
  } catch (err) {
    if (!reply.content) {
      reply.content = err.friendly || FRIENDLY_ERROR;
      reply.local = true; // tidak dikirim ulang ke model
      reply.notice = true;
    }
  } finally {
    if (frame) cancelAnimationFrame(frame);
    reply.pending = false;
    save();
    updateLast();
    setBusy(false);
    input.focus();
  }
}

/* ===== Mulai sesi ===== */
function start(profile) {
  state = { ...freshState(), mode: state.mode, started: true, profile };
  save();
  showScreen();
  if (profile?.tgl) {
    send(`Halo Mbah, aku ${profile.nama}, lahir ${ddmmyyyy(profile.tgl)}. Tolong buatkan Peta Diri awalku, ya.`);
  } else {
    const greet = profile?.nama
      ? `Sugeng rawuh, ${profile.nama}! Mbah Wening di sini 🌾 Tanpa tanggal lahir pun kita tetap bisa ngobrol. Mau cerita apa hari ini? Pilih menu di bawah, atau langsung ketik saja.`
      : OPENING;
    state.messages.push({ role: "assistant", content: greet, local: true });
    save();
    renderAll();
    input.focus();
  }
}

$("#profile-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const nama = $("#nama").value.replace(/\s+/g, " ").trim();
  const tgl = $("#tgl").value || null;
  const err = $("#form-error");
  if (!nama) {
    err.textContent = "Isi nama panggilan dulu ya, Nak, atau pilih “Lewati dulu”.";
    err.hidden = false;
    $("#nama").focus();
    return;
  }
  if (tgl && !/^\d{4}-\d{2}-\d{2}$/.test(tgl)) {
    err.textContent = "Tanggal lahir belum lengkap. Kosongkan saja kalau belum mau mengisi.";
    err.hidden = false;
    return;
  }
  err.hidden = true;
  start({ nama: nama.slice(0, 40), tgl });
});

$("#skip").addEventListener("click", (e) => {
  e.preventDefault();
  start(null);
});

/* ===== Composer ===== */
function autosize() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 160) + "px";
}
input.addEventListener("input", autosize);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    $("#composer").requestSubmit();
  }
});
$("#composer").addEventListener("submit", (e) => {
  e.preventDefault();
  if (busy) return;
  const text = input.value;
  input.value = "";
  autosize();
  send(text);
});

/* ===== Mode & hapus ===== */
document.querySelectorAll(".mode button").forEach((b) =>
  b.addEventListener("click", () => {
    state.mode = b.dataset.mode;
    save();
    renderMode();
  })
);
$("#clear").addEventListener("click", () => {
  if (busy) return;
  if (!confirm("Hapus seluruh percakapan dan profil di sesi ini?")) return;
  sessionStorage.removeItem(STORE_KEY);
  state = freshState();
  $("#profile-form").reset();
  showScreen();
  $("#nama").focus();
});

/* ===== Init ===== */
// Balasan yang terputus saat halaman dimuat ulang tidak dibiarkan menggantung.
state.messages.forEach((m) => {
  if (m.pending) {
    m.pending = false;
    if (!m.content) Object.assign(m, { content: FRIENDLY_ERROR, local: true, notice: true });
  }
});
renderChips();
showScreen();
