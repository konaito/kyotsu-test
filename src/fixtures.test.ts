import { expect, test } from "bun:test";
import { hasFixture, listFixtureIds, prepareFromFixture } from "./fixtures.ts";
import { demoSolve } from "./solve.ts";

test("fixture ids", () => {
  expect(listFixtureIds().sort()).toEqual(
    ["chiri-sougou", "joho", "kokugo", "reading"].sort(),
  );
});

test("prepareFromFixture reading → demoSolve は配点100満点", () => {
  expect(hasFixture("reading")).toBe(true);
  const prepared = prepareFromFixture("reading");
  const r = demoSolve(prepared);
  expect(r.maxScore).toBe(100);
  expect(r.score).toBeGreaterThan(50);
  expect(r.score).toBeLessThanOrEqual(100);
});
