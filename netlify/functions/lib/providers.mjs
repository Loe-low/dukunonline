// Rantai penyedia model dengan pindah otomatis (failover). Tanpa database:
// status "istirahat" tiap penyedia hanya di memori instance function.
// Isi pesan, nama, dan tanggal lahir TIDAK PERNAH di-log; hanya nama penyedia + status HTTP.

const FIRST_BYTE_TIMEOUT_MS = 20000;
const cooldownUntil = new Map(); // nama penyedia -> waktu (ms) boleh dicoba lagi

async function* anthropicStream({ system, messages, maxTokens }) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk"); // Netlify AI Gateway, tanpa key
  const events = await new Anthropic().messages.create({
    model: process.env.MODEL || "claude-sonnet-5-5",
    max_tokens: maxTokens,
    system,
    messages,
    stream: true,
  });
  for await (const ev of events) {
    if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") yield ev.delta.text;
  }
}

// Format "OpenAI-compatible": dipakai Groq, Gemini, dan Cloudflare Workers AI.
function openaiCompat({ url, keyEnv, model, ready = () => true }) {
  return {
    ready: () => Boolean(process.env[keyEnv]) && ready(),
    async *stream({ system, messages, maxTokens }) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), FIRST_BYTE_TIMEOUT_MS);
      let res;
      try {
        res = await fetch(url(), {
          method: "POST",
          signal: ctl.signal,
          headers: { "content-type": "application/json", authorization: `Bearer ${process.env[keyEnv]}` },
          body: JSON.stringify({
            model: model(),
            stream: true,
            max_tokens: maxTokens,
            messages: [{ role: "system", content: system }, ...messages],
          }),
        });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        throw Object.assign(new Error("http"), { status: res.status, retryAfter: Number(res.headers.get("retry-after")) || 0 });
      }
      const dec = new TextDecoder();
      let buf = "";
      for await (const chunk of res.body) {
        buf += dec.decode(chunk, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") return;
          try {
            const t = JSON.parse(data).choices?.[0]?.delta?.content;
            if (t) yield t;
          } catch {
            /* abaikan baris yang bukan JSON */
          }
        }
      }
    },
  };
}

export const PROVIDERS = {
  anthropic: { ready: () => true, stream: anthropicStream },
  groq: openaiCompat({
    url: () => "https://api.groq.com/openai/v1/chat/completions",
    keyEnv: "GROQ_API_KEY",
    model: () => process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
  }),
  cloudflare: openaiCompat({
    url: () => `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions`,
    keyEnv: "CLOUDFLARE_API_TOKEN",
    model: () => process.env.CLOUDFLARE_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    ready: () => Boolean(process.env.CLOUDFLARE_ACCOUNT_ID),
  }),
  gemini: openaiCompat({
    url: () => "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    keyEnv: "GEMINI_API_KEY",
    model: () => process.env.GEMINI_MODEL || "gemini-2.5-flash",
  }),
};

const list = (v, d) => (v ?? d).split(",").map((s) => s.trim()).filter(Boolean);

/**
 * Menghasilkan potongan teks dari penyedia pertama yang berhasil.
 * Pindah ke penyedia berikutnya hanya SEBELUM teks pertama terkirim.
 * Pesan krisis hanya dilayani penyedia di CRISIS_PROVIDERS (default: anthropic).
 */
export async function* streamWithFallback({ system, messages, maxTokens, crisis = false, providers = PROVIDERS, now = Date.now }) {
  let order = list(process.env.PROVIDER_ORDER, "anthropic,groq,cloudflare");
  if (crisis) {
    const allowed = list(process.env.CRISIS_PROVIDERS, "anthropic");
    order = order.filter((n) => allowed.includes(n));
  }
  for (const name of order) {
    const p = providers[name];
    if (!p || !p.ready()) continue;
    if ((cooldownUntil.get(name) || 0) > now()) continue;
    let started = false;
    try {
      for await (const t of p.stream({ system, messages, maxTokens })) {
        started = true;
        yield { t, provider: name };
      }
      if (started) return;
      throw Object.assign(new Error("empty"), { status: 0 });
    } catch (err) {
      if (started) throw err; // sebagian jawaban sudah terkirim; tidak bisa pindah
      const status = err?.status ?? 0;
      const quota = status === 429 || status === 402;
      cooldownUntil.set(name, now() + (quota ? Math.max(err.retryAfter || 0, 300) : 60) * 1000);
      console.error("chat: penyedia gagal", name, status, err?.name ?? "");
    }
  }
  throw Object.assign(new Error("semua penyedia gagal"), { allFailed: true });
}

export const _resetCooldownForTest = () => cooldownUntil.clear();
