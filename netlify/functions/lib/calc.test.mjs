import { test } from "node:test";
import assert from "node:assert/strict";
import { weton, shio, zodiak, validDate } from "./calc.mjs";

test("weton: 5 titik uji", () => {
  const cases = [
    [[1945, 8, 17], "Jumat", "Legi", 11],
    [[2000, 1, 1], "Sabtu", "Legi", 14],
    [[2026, 1, 1], "Kamis", "Pon", 15],
    [[2026, 11, 8], "Minggu", "Wage", 9],
    [[1945, 1, 1], "Senin", "Pon", 11],
  ];
  for (const [[y, m, d], hari, pasaran, neptu] of cases) {
    assert.deepEqual(weton(y, m, d), { hari, pasaran, neptu }, `${y}-${m}-${d}`);
  }
});

test("shio: 6 titik uji + tahun di luar tabel", () => {
  const cases = [
    [[2000, 1, 1], "Kelinci", "Tanah", false],
    [[2000, 2, 5], "Naga", "Logam", true],
    [[2026, 2, 17], "Kuda", "Api", true],
    [[2026, 1, 1], "Ular", "Kayu", false],
    [[1995, 1, 31], "Babi", "Kayu", true],
    [[1998, 1, 27], "Kerbau", "Api", true],
  ];
  for (const [[y, m, d], hewan, elemen, dekatImlek] of cases) {
    const r = shio(y, m, d);
    assert.equal(r.hewan, hewan, `${y}-${m}-${d} hewan`);
    assert.equal(r.elemen, elemen, `${y}-${m}-${d} elemen`);
    assert.equal(r.dekatImlek, dekatImlek, `${y}-${m}-${d} dekatImlek`);
  }
  assert.equal(shio(1985, 6, 1), null);
});

test("zodiak: titik uji batas", () => {
  const cases = [
    [[3, 20], "Pisces", true],
    [[3, 21], "Aries", true],
    [[1, 19], "Capricorn", true],
    [[1, 20], "Aquarius", true],
    [[1, 1], "Capricorn", false],
    [[12, 21], "Sagitarius", true],
    [[12, 22], "Capricorn", true],
    [[5, 5], "Taurus", false],
    [[11, 8], "Scorpio", false],
  ];
  for (const [[m, d], tanda, dekatBatas] of cases) {
    const r = zodiak(m, d);
    assert.equal(r.tanda, tanda, `${d}-${m} tanda`);
    assert.equal(r.dekatBatas, dekatBatas, `${d}-${m} dekatBatas`);
  }
});

test("validDate", () => {
  assert.equal(validDate(2026, 2, 31), false);
  assert.equal(validDate(2024, 2, 29), true);
  assert.equal(validDate(2026, 2, 29), false);
});
