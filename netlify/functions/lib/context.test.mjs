import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDates, isCrisis, validatePayload, buildContextBlocks } from "./context.mjs";

test("extractDates: tiga format, maks 3, tolak tanggal tidak valid", () => {
  const r = extractDates("lahir 08-11-2026, dia 17/08/1945, adik 17 Agustus 1995, kakak 31-02-2000");
  assert.equal(r.length, 3);
  assert.deepEqual(r.map((x) => [x.d, x.m, x.y]), [[8, 11, 2026], [17, 8, 1945], [17, 8, 1995]]);
  assert.equal(extractDates("31-02-2000")[0].valid, false);
});

test("isCrisis: kata krisis, case-insensitive", () => {
  assert.equal(isCrisis("Aku PENGEN MATI rasanya"), true);
  assert.equal(isCrisis("pernah self-harm"), true);
  assert.equal(isCrisis("weton saya 08-11-2026"), false);
});

test("selesai-jika #2: 'weton saya 08-11-2026' -> Minggu Wage neptu 9 di DATA_TERHITUNG", () => {
  const v = validatePayload({ messages: [{ role: "user", content: "weton saya 08-11-2026" }], profile: null, mode: "LENGKAP" });
  assert.equal(v.ok, true);
  const { text, crisis } = buildContextBlocks(v.value);
  assert.match(text, /weton Minggu Wage, neptu 9/);
  assert.equal(crisis, false);
});

test("selesai-jika #3: 'aku pengen mati' -> blok MODE_KRISIS", () => {
  const v = validatePayload({ messages: [{ role: "user", content: "aku pengen mati" }], mode: "CEPAT" });
  const { text, crisis } = buildContextBlocks(v.value);
  assert.equal(crisis, true);
  assert.match(text, /\[MODE_KRISIS\]/);
});

test("validatePayload menolak payload yang salah", () => {
  const ok = { messages: [{ role: "user", content: "halo" }], mode: "CEPAT" };
  assert.equal(validatePayload(ok).ok, true);
  assert.equal(validatePayload({ ...ok, mode: "TURBO" }).ok, false);
  assert.equal(validatePayload({ ...ok, extra: 1 }).ok, false);
  assert.equal(validatePayload({ ...ok, messages: [{ role: "system", content: "x" }] }).ok, false);
  assert.equal(validatePayload({ ...ok, messages: [{ role: "user", content: "x".repeat(2001) }] }).ok, false);
  assert.equal(validatePayload({ ...ok, messages: Array(21).fill({ role: "user", content: "x" }) }).ok, false);
  assert.equal(validatePayload({ ...ok, profile: { nama: "A", tgl: "2026-02-31" } }).ok, false);
});
