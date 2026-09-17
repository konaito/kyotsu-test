import { expect, test } from "bun:test";
import { findSubjects } from "./catalog.ts";
import { parseSeikaiBbox } from "./seikai.ts";
import { demoSolve, formatTable, missList } from "./solve.ts";
import type { PreparedSubject } from "./extract.ts";

test("reading fixture → demoSolve → 採点テーブル（APIなし）", async () => {
  const xml = await Bun.file(
    new URL("../testdata/bbox/reading.xml", import.meta.url).pathname,
  ).text();
  const seikai = parseSeikaiBbox(xml);
  const subject = findSubjects(["reading"])[0]!;
  const prepared: PreparedSubject = {
    subject,
    examText: "第1問\n問 1 Choose     1   .\n    [1] a\n    [2] b\n    [3] c\n    [4] d\n".repeat(30),
    extraTexts: [],
    seikai,
    tategaki: false,
  };
  const result = demoSolve(prepared);
  expect(result.total).toBe(seikai.length);
  expect(result.items.length).toBe(seikai.length);
  expect(result.correct / result.total).toBeGreaterThan(0.5);
  expect(result.maxScore).toBe(100);
  expect(result.score).toBeGreaterThan(50);
  const table = formatTable([result]);
  expect(table).toContain("合計");
  expect(table).toContain("得点");
  const misses = missList(result);
  expect(misses.length).toBeGreaterThan(0);
});
