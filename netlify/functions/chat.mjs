// POST /api/chat — Mbah Wening. Hitungan primbon dilakukan kode (lib/calc.mjs),
// model hanya menafsirkan. Isi pesan, nama, dan tanggal lahir TIDAK PERNAH di-log.
// Model dipilih lewat rantai penyedia dengan pindah otomatis (lib/providers.mjs).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validatePayload, buildContextBlocks } from "./lib/context.mjs";
import { streamWithFallback } from "./lib/providers.mjs";

const MAX_TOKENS = Number(process.env.MAX_TOKENS) || 1100;
const FRIENDLY_ERROR = "Mbah lagi istirahat sebentar, coba lagi nanti ya 🌾";
// Dipakai bila pesan krisis tidak bisa dilayani penyedia mana pun.
const CRISIS_STATIC =
  "Mbah di sini menemanimu. Kalau kamu merasa tidak aman sekarang, hubungi Healing119 Kemenkes: telepon 119 lalu pilih ekstensi 8 (gratis, 24 jam), atau buka healing119.id. Untuk bahaya langsung, hubungi 112 atau IGD terdekat. Kamu tidak sendirian 🌾";

let promptCache = null;
async function masterPrompt() {
  if (promptCache) return promptCache;
  const candidates = [
    join(process.cwd(), "prompts", "mbah-wening.md"),
    new URL("../../prompts/mbah-wening.md", import.meta.url),
  ];
  for (const p of candidates) {
    try {
      promptCache = await readFile(p, "utf8");
      return promptCache;
    } catch {
      /* coba kandidat berikutnya */
    }
  }
  throw new Error("master prompt not found");
}

const json = (status, obj) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Gunakan metode POST." });

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Format permintaan harus JSON." });
  }
  const v = validatePayload(body);
  if (!v.ok) return json(400, { error: v.error });

  const { text: contextBlocks, crisis } = buildContextBlocks(v.value);

  const encoder = new TextEncoder();
  const sse = (obj) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(sse({ crisis }));
      let sentText = false;
      try {
        const system = `${await masterPrompt()}\n\n${contextBlocks}`;
        for await (const { t } of streamWithFallback({ system, messages: v.value.messages, maxTokens: MAX_TOKENS, crisis })) {
          sentText = true;
          controller.enqueue(sse({ t }));
        }
      } catch (err) {
        // Hanya metadata teknis, tanpa isi percakapan.
        console.error("chat: gagal", err?.status ?? "", err?.name ?? "");
      }
      if (!sentText) controller.enqueue(sse(crisis ? { t: CRISIS_STATIC } : { error: FRIENDLY_ERROR }));
      controller.enqueue(sse({ done: true }));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
};

export const config = {
  path: "/api/chat",
  method: "POST",
  rateLimit: {
    windowLimit: 15, // 15 permintaan
    windowSize: 60, // per 60 detik
    aggregateBy: ["ip", "domain"], // per pengunjung (IP)
  },
};
