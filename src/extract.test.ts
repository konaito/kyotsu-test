import { expect, test } from "bun:test";
import { isTategaki, reconstructTategaki } from "./extract.ts";

test("isTategaki: 短い行が大半なら縦書き", () => {
  const lines = Array.from({ length: 80 }, (_, i) => (i % 10 === 0 ? "長い行ですここ" : "あ"));
  expect(isTategaki(lines.join("\n"))).toBe(true);
});

test("isTategaki: 通常の横書きは false", () => {
  const lines = Array.from({ length: 80 }, () => "This is a normal horizontal line of text.");
  expect(isTategaki(lines.join("\n"))).toBe(false);
});

test("isTategaki: 行が少なければ false", () => {
  expect(isTategaki("あ\nい\nう")).toBe(false);
});

test("reconstructTategaki: 1〜2文字行を連結", () => {
  const raw = ["第", "1", "問", "", "本", "文", "あ", "", "長い見出し"].join("\n");
  const out = reconstructTategaki(raw);
  expect(out).toContain("第1問");
  expect(out).toContain("本文あ");
  expect(out).toContain("長い見出し");
});

test("reconstructTategaki: 空入力", () => {
  expect(reconstructTategaki("")).toBe("");
  expect(reconstructTategaki("\n\n")).toBe("");
});
