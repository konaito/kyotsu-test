import { expect, test } from "bun:test";
import { SUBJECTS } from "./catalog.ts";
import { hasFixture, listFixtureIds, prepareFromFixture } from "./fixtures.ts";
import { demoSolve } from "./solve.ts";

test("fixture ids cover catalog", () => {
  expect(listFixtureIds().sort()).toEqual(SUBJECTS.map((s) => s.id).sort());
});

test("every catalog subject hasFixture", () => {
  for (const s of SUBJECTS) {
    expect(hasFixture(s.id)).toBe(true);
  }
});

test("prepareFromFixture reading → demoSolve は配点100満点", () => {
  expect(hasFixture("reading")).toBe(true);
  const prepared = prepareFromFixture("reading");
  const r = demoSolve(prepared);
  expect(r.maxScore).toBe(100);
  expect(r.score).toBeGreaterThan(50);
  expect(r.score).toBeLessThanOrEqual(100);
});

test("prepareFromFixture koukyo (newly added) → demoSolve", () => {
  expect(hasFixture("koukyo")).toBe(true);
  const prepared = prepareFromFixture("koukyo");
  const r = demoSolve(prepared);
  expect(r.maxScore).toBeGreaterThan(0);
  expect(r.total).toBe(prepared.seikai.length);
  expect(r.score).toBeGreaterThan(0);
});


test("prepareFromFixture kagaku → maxScore 100 (elective 第5/第6)", () => {
  const prepared = prepareFromFixture("kagaku");
  expect(prepared.officialMax).toBe(100);
  expect(prepared.electiveDaimons).toEqual([["第5問", "第6問"]]);
  const r = demoSolve(prepared);
  expect(r.maxScore).toBe(100);
  expect(prepared.seikai.some((s) => s.slot === "18" && s.points === 0)).toBe(true);
  expect(prepared.seikai.some((s) => s.slot === "25" && s.points === 1)).toBe(true);
});

test("prepareFromFixture koukyo-rinri → maxScore 100 (slots 27/28)", () => {
  const prepared = prepareFromFixture("koukyo-rinri");
  expect(prepared.officialMax).toBe(100);
  const slots = new Set(prepared.seikai.map((s) => s.slot));
  expect(slots.has("27")).toBe(true);
  expect(slots.has("28")).toBe(true);
  const r = demoSolve(prepared);
  expect(r.maxScore).toBe(100);
  expect(prepared.seikai.find((s) => s.slot === "27")?.answers.sort()).toEqual(["1", "2"]);
  expect(prepared.seikai.find((s) => s.slot === "28")?.answers.sort()).toEqual(["2", "5"]);
});

test("all fixtures maxScore matches official 満点", () => {
  const expected: Record<string, number> = {
    kokugo: 200,
    "chiri-tankyu": 100,
    "nihonshi-tankyu": 100,
    "sekaishi-tankyu": 100,
    "koukyo-rinri": 100,
    "koukyo-seiji": 100,
    "chiri-sougou": 50,
    "rekishi-sougou": 50,
    koukyo: 50,
    "butsuri-kiso": 50,
    "kagaku-kiso": 50,
    "seibutsu-kiso": 50,
    "chigaku-kiso": 50,
    butsuri: 100,
    kagaku: 100,
    seibutsu: 100,
    chigaku: 100,
    reading: 100,
    joho: 100,
  };
  for (const id of listFixtureIds()) {
    const r = demoSolve(prepareFromFixture(id));
    if (r.maxScore !== expected[id]) {
      throw new Error(`${id}: maxScore ${r.maxScore} ≠ expected ${expected[id]}`);
    }
    expect(r.maxScore).toBe(expected[id]!);
  }
});
