import { expect, test } from "bun:test";
import { dncUrl, findSubjects, SUBJECTS, type DncFile } from "./catalog.ts";

test("SUBJECTS は重複しない id を持つ", () => {
  const ids = SUBJECTS.map((s) => s.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toContain("reading");
  expect(ids).toContain("kokugo");
  expect(ids).toContain("joho");
  expect(ids).not.toContain("math");
});

test("各科目は exam/seikai/options を持つ", () => {
  for (const s of SUBJECTS) {
    expect(s.exam.f).toMatch(/^abm/);
    expect(s.exam.n).toMatch(/\.pdf$/);
    expect(s.seikai.f).toMatch(/^abm/);
    expect(s.seikai.n).toMatch(/\.pdf$/);
    expect(s.options.length).toBeGreaterThanOrEqual(9);
    expect(s.name.length).toBeGreaterThan(0);
  }
});

test("findSubjects(undefined) は全科目", () => {
  expect(findSubjects(undefined)).toEqual(SUBJECTS);
  expect(findSubjects([])).toEqual(SUBJECTS);
});

test("findSubjects は指定順ではなくカタログ順で返す", () => {
  const found = findSubjects(["reading", "kokugo"]);
  expect(found.map((s) => s.id)).toEqual(["kokugo", "reading"]);
});

test("findSubjects 未知 id はエラー", () => {
  expect(() => findSubjects(["nope"])).toThrow(/未知の科目id/);
  expect(() => findSubjects(["reading", "zzz"])).toThrow(/zzz/);
});

test("dncUrl は d/f/n を含む", () => {
  const file: DncFile = { d: 771, f: "abm00005957.pdf", n: "2025_op_20_reading.pdf" };
  const url = dncUrl(file);
  expect(url).toContain("d=771");
  expect(url).toContain("f=abm00005957.pdf");
  expect(url).toContain("n=2025_op_20_reading.pdf");
  expect(url.startsWith("https://www.dnc.ac.jp/")).toBe(true);
});

test("dncUrl は n を encode する", () => {
  const file: DncFile = { d: 1, f: "a.pdf", n: "日本語.pdf" };
  expect(dncUrl(file)).toContain(encodeURIComponent("日本語.pdf"));
});

test("seikaiRange 付き科目がある", () => {
  const ranged = SUBJECTS.filter((s) => s.seikaiRange);
  expect(ranged.map((s) => s.id)).toContain("chiri-sougou");
  expect(ranged.map((s) => s.id)).toContain("butsuri-kiso");
});

