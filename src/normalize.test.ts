import { expect, test } from "bun:test";
import {
  normalizeExamText,
  parseChoices,
  splitPassages,
} from "./normalize.ts";

test("行頭の ! \" # $ を [1][2][3][4] にする", () => {
  const src = `問 1 foo       1   .

    !    aquarium lovers
    "    experienced
    #    fish fans
    $    newcomers
`;
  const t = normalizeExamText(src);
  expect(t).toContain("[1]    aquarium lovers");
  expect(t).toContain("[2]    experienced");
  expect(t).toContain("[3]    fish fans");
  expect(t).toContain("[4]    newcomers");
  expect(t).not.toMatch(/^\s+! /m);
});

test("!〜% を範囲として直す。本文の %を は触らない", () => {
  const t = normalizeExamText("うちから!〜%のうち\n%を完全不平等");
  expect(t).toContain("[1]〜[5]");
  expect(t).toContain("%を完全不平等");
});

test("大問分割", () => {
  const t = normalizeExamText("注意書き\n第１問 本文A\n第２問 本文B");
  const p = splitPassages(t);
  expect(p.map((x) => x.label)).toEqual(["第1問", "第2問"]);
  expect(p[0]?.text).toContain("本文A");
  expect(p[1]?.text).toContain("本文B");
});

test("問ブロックから解答番号と選択肢を取る", () => {
  const t = normalizeExamText(`第1問
問 1 The customers are       1   .

    !    aquarium lovers who are looking for discount prices
    "    experienced fish lovers who need specialized advice
    #    fish fans who want different methods of feeding their fish
    $    newcomers who need to be informed about their aquarium

問 2 When arranging,     2     .

    !    avoid using solid
    "    provide the right amount
    #    reuse toothbrush
    $    wash roughly
`);
  const qs = parseChoices(splitPassages(t)[0]!.text);
  expect(qs[0]?.slot).toBe("1");
  expect(qs[0]?.options["1"]).toContain("aquarium lovers");
  expect(qs[0]?.options["4"]).toContain("newcomers");
  expect(qs[1]?.slot).toBe("2");
  expect(Object.keys(qs[1]!.options)).toEqual(["1", "2", "3", "4"]);
});
