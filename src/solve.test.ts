import { expect, test } from "bun:test";
import type { PreparedSubject } from "./extract.ts";
import { findSubjects } from "./catalog.ts";
import {
  demoSolve,
  formatTable,
  missList,
  MODEL_ID,
  type SubjectResult,
} from "./solve.ts";
import type { SeikaiItem } from "./seikai.ts";

function preparedFixture(overrides?: Partial<PreparedSubject>): PreparedSubject {
  const subject = findSubjects(["reading"])[0]!;
  const seikai: SeikaiItem[] = [
    {
      key: "第1問:1",
      daimon: "第1問",
      slot: "1",
      answers: ["4"],
      points: 2,
      unordered: false,
      groupId: "g1",
    },
    {
      key: "第1問:2",
      daimon: "第1問",
      slot: "2",
      answers: ["1"],
      points: 2,
      unordered: false,
      groupId: "g2",
    },
    {
      key: "第7問:30",
      daimon: "第7問",
      slot: "30",
      answers: ["3", "4"],
      points: 3,
      unordered: true,
      groupId: "g30",
    },
    {
      key: "第7問:31",
      daimon: "第7問",
      slot: "31",
      answers: ["3", "4"],
      points: 3,
      unordered: true,
      groupId: "g30",
    },
    {
      key: "第8問:44",
      daimon: "第8問",
      slot: "44",
      answers: ["1"],
      points: 4,
      unordered: false,
      groupId: "g44",
    },
  ];
  // hashKey(item.key) % 5 === 0 になるキーを混ぜてデモの誤答パスも踏む
  return {
    subject,
    examText: "第1問\n".repeat(50) + "enough exam text for tokens ".repeat(20),
    extraTexts: [],
    seikai,
    tategaki: false,
    ...overrides,
  };
}

test("MODEL_ID は jev", () => {
  expect(MODEL_ID).toBe("typesafe-ai/jev");
});

test("demoSolve は全スロットに予測を埋め、APIを叩かない", () => {
  const p = preparedFixture();
  const r = demoSolve(p);
  expect(r.total).toBe(p.seikai.length);
  expect(r.items.every((i) => i.predicted != null)).toBe(true);
  expect(r.correct).toBeGreaterThanOrEqual(0);
  expect(r.correct).toBeLessThanOrEqual(r.total);
  expect(r.elapsedMs).toBeGreaterThan(0);
  expect(r.subject.id).toBe("reading");
  expect(r.extraLabels).toContain("デモ");
});

test("demoSolve の約2割は意図的に誤答（hash % 5 === 0）", () => {
  // 十分な件数で比率を緩く確認
  const many: SeikaiItem[] = Array.from({ length: 50 }, (_, i) => ({
    key: `k${i}`,
    daimon: "第1問",
    slot: String(i + 1),
    answers: ["1"],
    points: 2,
    unordered: false,
    groupId: `g${i}`,
  }));
  const r = demoSolve(preparedFixture({ seikai: many }));
  const wrong = r.items.filter((i) => !i.correct).length;
  expect(wrong).toBeGreaterThan(0);
  expect(wrong).toBeLessThan(many.length);
});

test("formatTable は科目行と合計行を含む", () => {
  const r = demoSolve(preparedFixture());
  const table = formatTable([r]);
  expect(table).toContain("英語（リーディング）");
  expect(table).toContain("合計");
  expect(table).toContain(`${r.score}/${r.maxScore}`);
  expect(table).toContain("得点");
});

test("missList 全問一致と誤り一覧", () => {
  const perfect: SubjectResult = {
    ...demoSolve(preparedFixture()),
    items: demoSolve(preparedFixture()).items.map((i) => ({ ...i, correct: true })),
    correct: 5,
    score: 11,
    maxScore: 11,
  };
  expect(missList(perfect)).toContain("全問一致");

  const withMiss: SubjectResult = {
    ...perfect,
    items: [
      {
        key: "第1問:1",
        predicted: "2",
        gold: ["4"],
        unordered: false,
        correct: false,
        points: 2,
        probability: 0.4,
        confidence: undefined,
      },
    ],
    correct: 0,
    total: 1,
    score: 0,
    maxScore: 2,
  };
  const miss = missList(withMiss);
  expect(miss).toContain("誤り 1件");
  expect(miss).toContain("pred=2");
  expect(miss).toContain("gold=4");
});

test("unordered groupId の配点は1回だけ数える", () => {
  const p = preparedFixture();
  const r = demoSolve(p);
  // g30 is 3 points once even though two slots
  expect(r.maxScore).toBe(2 + 2 + 3 + 4);
  expect(r.score).toBeLessThanOrEqual(r.maxScore);
});
