import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { streamWithFallback, _resetCooldownForTest } from "./providers.mjs";

const ok = (txt) => ({ ready: () => true, async *stream() { yield txt; } });
const fail = (status) => ({ ready: () => true, async *stream() { throw Object.assign(new Error("x"), { status }); } });
const collect = async (it) => { let s = ""; let p; for await (const { t, provider } of it) { s += t; p = provider; } return { s, p }; };
const base = { system: "s", messages: [{ role: "user", content: "hai" }], maxTokens: 10 };

beforeEach(() => { _resetCooldownForTest(); process.env.PROVIDER_ORDER = "a,b,c"; delete process.env.CRISIS_PROVIDERS; });

test("pindah ke penyedia berikutnya saat kena limit (429)", async () => {
  const r = await collect(streamWithFallback({ ...base, providers: { a: fail(429), b: ok("dari-b"), c: ok("dari-c") } }));
  assert.deepEqual(r, { s: "dari-b", p: "b" });
});

test("penyedia yang kena limit diistirahatkan, tidak dicoba lagi", async () => {
  let calls = 0;
  const a = { ready: () => true, async *stream() { calls++; throw Object.assign(new Error("x"), { status: 429 }); } };
  const providers = { a, b: ok("b"), c: ok("c") };
  await collect(streamWithFallback({ ...base, providers }));
  await collect(streamWithFallback({ ...base, providers }));
  assert.equal(calls, 1);
});

test("penyedia tanpa kunci dilewati", async () => {
  const r = await collect(streamWithFallback({ ...base, providers: { a: { ready: () => false, stream: () => { throw new Error("tak boleh"); } }, b: ok("b") } }));
  assert.equal(r.p, "b");
});

test("semua gagal -> error allFailed", async () => {
  await assert.rejects(collect(streamWithFallback({ ...base, providers: { a: fail(500), b: fail(429), c: fail(0) } })), (e) => e.allFailed === true);
});

test("pesan krisis hanya ke penyedia krisis (default anthropic)", async () => {
  process.env.PROVIDER_ORDER = "anthropic,b";
  await assert.rejects(collect(streamWithFallback({ ...base, crisis: true, providers: { anthropic: fail(429), b: ok("b") } })), (e) => e.allFailed === true);
});

test("gagal di tengah jawaban tidak pindah penyedia", async () => {
  const mid = { ready: () => true, async *stream() { yield "sebagian"; throw new Error("putus"); } };
  await assert.rejects(collect(streamWithFallback({ ...base, providers: { a: mid, b: ok("b") } })), /putus/);
});
