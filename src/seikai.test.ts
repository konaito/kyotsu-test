import { expect, test } from "bun:test";
import { parseBboxPages, parseSeikaiBbox, scoreItem, type SeikaiItem } from "./seikai.ts";

const FIX = (name: string) =>
  new URL(`../testdata/bbox/${name}`, import.meta.url).pathname;

async function load(name: string): Promise<string> {
  return await Bun.file(FIX(name)).text();
}

test("parseBboxPages が word 座標を読む", async () => {
  const pages = parseBboxPages(await load("kokugo.xml"));
  expect(pages.length).toBeGreaterThan(0);
  expect(pages[0]!.words.length).toBeGreaterThan(10);
  expect(pages[0]!.width).toBeGreaterThan(100);
});

test("国語 正解 38問（fixture XML）", async () => {
  const items = parseSeikaiBbox(await load("kokugo.xml"));
  const map = Object.fromEntries(items.map((i) => [i.slot, i.answers.join("-")]));
  expect(items.length).toBe(38);
  expect(map["1"]).toBe("3");
  expect(map["10"]).toBe("2");
  expect(map["22"]).toBe("5");
  expect(map["23"]).toBe("2");
  expect(map["38"]).toBe("4");
});

test("英語R 正解 44スロット（fixture XML）", async () => {
  const items = parseSeikaiBbox(await load("reading.xml"));
  const map = Object.fromEntries(items.map((i) => [i.slot, i]));
  expect(items.length).toBeGreaterThanOrEqual(41);
  expect(map["1"]?.answers).toEqual(["4"]);
  expect(map["19"]?.answers).toEqual(["6"]);
  expect(map["30"]?.unordered).toBe(true);
  expect(map["31"]?.answers.sort()).toEqual(["3", "4"]);
  expect(map["44"]?.answers).toEqual(["1"]);
});

test("情報I 第1問ア=2（fixture XML）", async () => {
  const items = parseSeikaiBbox(await load("joho.xml"));
  expect(items.length).toBeGreaterThan(20);
  const firstA = items.find((i) => i.slot === "ア");
  expect(firstA?.answers).toEqual(["2"]);
  expect(firstA?.daimon).toBe("第1問");
  const shi = items.filter((i) => i.slot === "シ");
  expect(shi.map((i) => `${i.daimon}:${i.answers.join("/")}`).sort()).toEqual([
    "第2問:1/2",
    "第3問:0",
    "第4問:4",
  ]);
});

test("地理総合 出題範囲フィルタ 101=2（fixture XML+layout）", async () => {
  const layout = await load("chiri_shared.layout.txt");
  const items = parseSeikaiBbox(await load("chiri_shared.xml"), "地理総合", layout);
  const m = Object.fromEntries(items.map((i) => [i.slot, i.answers.join("-")]));
  expect(m["101"]).toBe("2");
  expect(m["108"]).toBe("1");
  expect(m["116"]).toBe("4");
  expect(items.length).toBe(16);
});

test("未知の出題範囲はエラー", async () => {
  const xml = await load("chiri_shared.xml");
  expect(() => parseSeikaiBbox(xml, "存在しない科目", "dummy")).toThrow(/出題範囲/);
});

test("空XMLはエラー", () => {
  expect(() => parseSeikaiBbox("<html></html>")).toThrow(/ページを読めなかった/);
});

test("scoreItem 通常は answers に含まれれば正", () => {
  const item: SeikaiItem = {
    key: "第1問:1",
    daimon: "第1問",
    slot: "1",
    answers: ["3"],
    unordered: false,
    groupId: "g1",
  };
  const sib = [{ item, predicted: "3" }];
  expect(scoreItem(item, "3", sib)).toBe(true);
  expect(scoreItem(item, "1", sib)).toBe(false);
  expect(scoreItem(item, undefined, sib)).toBe(false);
});

test("scoreItem 順不同は group 全体の集合一致", () => {
  const a: SeikaiItem = {
    key: "第7問:30",
    daimon: "第7問",
    slot: "30",
    answers: ["3", "4"],
    unordered: true,
    groupId: "g:30-31",
  };
  const b: SeikaiItem = {
    key: "第7問:31",
    daimon: "第7問",
    slot: "31",
    answers: ["3", "4"],
    unordered: true,
    groupId: "g:30-31",
  };
  const ok = [
    { item: a, predicted: "4" },
    { item: b, predicted: "3" },
  ];
  expect(scoreItem(a, "4", ok)).toBe(true);
  expect(scoreItem(b, "3", ok)).toBe(true);
  const ng = [
    { item: a, predicted: "3" },
    { item: b, predicted: "3" },
  ];
  expect(scoreItem(a, "3", ng)).toBe(false);
});
