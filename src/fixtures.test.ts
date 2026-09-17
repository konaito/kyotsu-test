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

test("prepareFromFixture listening includes 公式スクリプト", () => {
  const prepared = prepareFromFixture("listening");
  expect(prepared.extraTexts.some((e) => e.label.includes("スクリプト"))).toBe(
    true,
  );
  const r = demoSolve(prepared);
  expect(r.maxScore).toBe(100);
});
