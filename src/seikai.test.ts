import { expect, test } from "bun:test";
import { parseSeikaiBbox } from "./seikai.ts";

async function bbox(path: string): Promise<string> {
  const proc = Bun.spawn(["pdftotext", "-bbox", path, "-"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  const code = await proc.exited;
  expect(code).toBe(0);
  return out;
}

test("国語 正解 38問", async () => {
  const items = parseSeikaiBbox(
    await bbox("/tmp/kyotsu-sample/kokugo_seikai.pdf"),
  );
  const map = Object.fromEntries(items.map((i) => [i.slot, i.answers.join("-")]));
  expect(items.length).toBe(38);
  expect(map["1"]).toBe("3");
  expect(map["10"]).toBe("2");
  expect(map["22"]).toBe("5");
  expect(map["23"]).toBe("2");
  expect(map["38"]).toBe("4");
});

test("英語R 正解 44スロット", async () => {
  const items = parseSeikaiBbox(
    await bbox("/tmp/kyotsu-sample/reading_seikai.pdf"),
  );
  const map = Object.fromEntries(items.map((i) => [i.slot, i]));
  expect(items.length).toBeGreaterThanOrEqual(41);
  expect(map["1"]?.answers).toEqual(["4"]);
  expect(map["19"]?.answers).toEqual(["6"]);
  expect(map["30"]?.unordered).toBe(true);
  expect(map["31"]?.answers.sort()).toEqual(["3", "4"]);
  expect(map["44"]?.answers).toEqual(["1"]);
});

test("情報I 第1問ア=2", async () => {
  const items = parseSeikaiBbox(
    await bbox("/tmp/kyotsu-sample/joho_seikai.pdf"),
  );
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

test("地理総合 出題範囲フィルタ 101=2", async () => {
  const path = "/tmp/kyotsu-seikai/chiri_sougou_seikai.pdf";
  const layoutProc = Bun.spawn(["pdftotext", "-layout", path, "-"], {
    stdout: "pipe",
  });
  const layout = await new Response(layoutProc.stdout).text();
  const items = parseSeikaiBbox(await bbox(path), "地理総合", layout);
  const m = Object.fromEntries(items.map((i) => [i.slot, i.answers.join("-")]));
  expect(m["101"]).toBe("2");
  expect(m["108"]).toBe("1");
  expect(m["116"]).toBe("4");
  expect(items.length).toBe(16);
});
