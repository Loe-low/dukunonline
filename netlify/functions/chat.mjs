// POST /api/chat — Mbah Wening. Hitungan primbon dilakukan kode (lib/calc.mjs),
// model hanya menafsirkan. Isi pesan, nama, dan tanggal lahir TIDAK PERNAH di-log.
import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validatePayload, buildContextBlocks } from "./lib/context.mjs";

const DEFAULT_MODEL = "claude-sonnet-5-5"; // alternatif lebih murah: "claude-haiku-5-5"
const FRIENDLY_ERROR = "Mbah lagi istirahat sebentar, coba lagi nanti ya 🌾";

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
        const anthropic = new Anthropic();
        const events = await anthropic.messages.create({
          model: process.env.MODEL || DEFAULT_MODEL,
          max_tokens: 700,
          system,
          messages: v.value.messages,
          stream: true,
        });
        for await (const ev of events) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            sentText = true;
            controller.enqueue(sse({ t: ev.delta.text }));
          }
        }
        if (!sentText) controller.enqueue(sse({ error: FRIENDLY_ERROR }));
      } catch (err) {
        // Hanya metadata teknis, tanpa isi percakapan.
        console.error("chat: model error", err?.status ?? "", err?.name ?? "");
        controller.enqueue(sse({ error: FRIENDLY_ERROR }));
      }
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
