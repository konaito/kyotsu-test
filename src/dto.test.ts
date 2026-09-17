import { expect, test } from "bun:test";
import type { FilledDTO, PaperDTO, SubjectInfo } from "./dto.ts";

test("PaperDTO / FilledDTO の形を満たすオブジェクトを組み立てられる", () => {
  const paper: PaperDTO = {
    id: "reading",
    name: "英語（リーディング）",
    options: ["1", "2", "3", "4"],
    tategaki: false,
    extraLabels: [],
    slots: [{ key: "第1問:1", slot: "1", daimon: "第1問" }],
  };
  const filled: FilledDTO = {
    id: "reading",
    elapsedMs: 12.5,
    inputTokens: 100,
    demo: true,
    items: [
      {
        key: "第1問:1",
        predicted: "4",
        gold: ["4"],
        unordered: false,
        correct: true,
        probability: 0.9,
      },
    ],
  };
  const info: SubjectInfo = { id: paper.id, name: paper.name };
  expect(info.id).toBe(filled.id);
  expect(paper.slots[0]?.key).toBe(filled.items[0]?.key);
});
