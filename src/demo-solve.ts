import type { Subject } from "./catalog.ts";
import type { PreparedSubject } from "./extract.ts";
import { scoreItem, type SeikaiItem } from "./seikai.ts";

export type ItemResult = {
  key: string;
  predicted: string | undefined;
  gold: string[];
  unordered: boolean;
  correct: boolean;
  /** Official 配点 for this slot (hyphen siblings share; aggregate once per groupId). */
  points: number;
  probability: number | undefined;
  confidence: number | undefined;
};

export type SubjectResult = {
  subject: Subject;
  items: ItemResult[];
  correct: number;
  total: number;
  /** Earned points (配点), counting each groupId once. */
  score: number;
  /** Sum of 配点, counting each groupId once. */
  maxScore: number;
  elapsedMs: number;
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  tategaki: boolean;
  extraLabels: string[];
};

/** Aggregate official 配点 once per unordered/hyphen groupId. */
export function aggregateScore(
  seikai: SeikaiItem[],
  items: ItemResult[],
): { score: number; maxScore: number } {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const seen = new Set<string>();
  let score = 0;
  let maxScore = 0;
  for (const s of seikai) {
    if (seen.has(s.groupId)) continue;
    seen.add(s.groupId);
    const pts = s.points ?? 0;
    maxScore += pts;
    if (byKey.get(s.key)?.correct) score += pts;
  }
  return { score, maxScore };
}

function criteriaOf(options: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const o of options) {
    out[o] = `選択肢 ${o}`;
  }
  return out;
}

function instructionFor(
  subjectName: string,
  item: { daimon: string | null; slot: string },
  stem?: string,
): string {
  const where = item.daimon
    ? `${item.daimon} 解答番号 ${item.slot}`
    : `解答番号 ${item.slot}`;
  const stemBit = stem ? ` 設問: ${stem.slice(0, 180)}` : "";
  return [
    `${subjectName} ${where}。`,
    stemBit,
    " state の本文と選択肢を読み、最も適当な選択肢番号を一つ選べ。",
    " [1] [2] [3] … がマークする数字。図表が欠けていれば残った本文だけで選ぶ。",
  ].join("");
}

type Chunk = {
  label: string;
  text: string;
  items: PreparedSubject["seikai"];
  parsed: ReturnType<typeof parseChoices>;
};

function chunksFor(prepared: PreparedSubject): Chunk[] {
  const exam = normalizeExamText(prepared.examText);
  const passages = splitPassages(exam);
  const extras = prepared.extraTexts
    .map((e) => `【${e.label}】\n${normalizeExamText(e.text)}`)
    .join("\n\n");
  const parsedMap = new Map(
    passages.map((p) => [p.label, parseChoices(p.text)] as const),
  );

  const homeOf = (item: PreparedSubject["seikai"][number]): string => {
    if (/[ァ-ン]/.test(item.slot) && item.daimon) return item.daimon;
    for (const p of passages) {
      if (parsedMap.get(p.label)?.some((q) => q.slot === item.slot)) {
        return p.label;
      }
    }
    return item.daimon ?? passages[0]?.label ?? "全体";
  };

  const byLabel = new Map<string, Chunk>();
  for (const item of prepared.seikai) {
    const label = homeOf(item);
    let chunk = byLabel.get(label);
    if (!chunk) {
      const passage = passages.find((p) => p.label === label);
      const text = [passage?.text ?? exam, extras].filter(Boolean).join("\n\n");
      chunk = {
        label,
        text,
        items: [],
        parsed: parsedMap.get(label) ?? parseChoices(passage?.text ?? exam),
      };
      byLabel.set(label, chunk);
    }
    chunk.items.push(item);
  }
  return [...byLabel.values()];
}

function questionFor(
  prepared: PreparedSubject,
  item: PreparedSubject["seikai"][number],
  parsed: ReturnType<typeof parseChoices>,
): ChoiceQuestion {
  const hit = parsed.find((q) => q.slot === item.slot);
  const criteria = hit
    ? Object.fromEntries(
        Object.entries(hit.options).map(([k, v]) => [k, v.slice(0, 400)]),
      )
    : criteriaOf(prepared.subject.options);
  return {
    type: "choice",
    instructions: instructionFor(prepared.subject.name, item, hit?.stem),
    criteria,
  };
}

function hashKey(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** jevが使えないときの演出用。予測の8割は正解、2割は別選択肢。 */
export function demoSolve(prepared: PreparedSubject): SubjectResult {
  const siblings = prepared.seikai.map((item) => {
    const wrong = hashKey(item.key) % 5 === 0;
    let predicted = item.answers[0];
    if (wrong) {
      predicted =
        prepared.subject.options.find((o) => !item.answers.includes(o)) ??
        predicted;
    }
    return { item, predicted };
  });
  const items: ItemResult[] = siblings.map(({ item, predicted }) => ({
    key: item.key,
    predicted,
    gold: item.answers,
    unordered: item.unordered,
    correct: scoreItem(item, predicted, siblings),
    points: item.points,
    probability: predicted && item.answers.includes(predicted) ? 0.91 : 0.42,
    confidence: undefined,
  }));
  const { score, maxScore } = aggregateScore(prepared.seikai, items);
  return {
    subject: prepared.subject,
    items,
    correct: items.filter((i) => i.correct).length,
    total: items.length,
    score,
    maxScore,
    elapsedMs: 220 + prepared.seikai.length * 2.4,
    inputTokens: Math.round(prepared.examText.length * 0.4),
    outputTokens: prepared.seikai.length * 8,
    tategaki: prepared.tategaki,
    extraLabels: [...prepared.extraTexts.map((e) => e.label), "デモ"],
  };
}

