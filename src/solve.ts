import type { PreparedSubject } from "./extract.ts";
import {
  normalizeExamText,
  parseChoices,
  splitPassages,
} from "./normalize.ts";
import { scoreItem } from "./seikai.ts";
import {
  aggregateScore,
  demoSolve,
  type ItemResult,
  type SubjectResult,
} from "./demo-solve.ts";

export const MODEL_ID = "typesafe-ai/jev";
export { aggregateScore, demoSolve, type ItemResult, type SubjectResult };

type ChoiceQuestion = {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
};

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

export async function pingJev(): Promise<void> {
  const { gateway } = await import("@ai-sdk/gateway");
  const { experimental_evaluate: evaluate } = await import("ai");
  const result = await evaluate({
    model: gateway.evaluationModel(MODEL_ID),
    state: "The support agent issued a full refund to the customer.",
    questions: {
      refunded: {
        type: "boolean",
        instructions: "Was a refund issued?",
      },
    },
  });
  const p = result.answers.refunded.probability;
  if (p < 0.5) {
    throw new Error(`jev ping が変: probability=${p}`);
  }
}

export async function solveSubject(
  prepared: PreparedSubject,
): Promise<SubjectResult> {
  const chunks = chunksFor(prepared);
  if (chunks.length === 0) {
    throw new Error(`${prepared.subject.name}: 大問に分割できなかった`);
  }
  const { gateway } = await import("@ai-sdk/gateway");
  const { experimental_evaluate: evaluate } = await import("ai");
  const started = performance.now();
  const chunkOut = await Promise.all(
    chunks.map(async (chunk) => {
      const questions: Record<string, ChoiceQuestion> = {};
      for (const item of chunk.items) {
        questions[item.key] = questionFor(prepared, item, chunk.parsed);
      }
      const result = await evaluate({
        model: gateway.evaluationModel(MODEL_ID),
        state: {
          subject: prepared.subject.name,
          section: chunk.label,
          legend:
            "本文中の [1] [2] [3] … は選択肢番号で、マークシートの数字と一致する。",
          text: chunk.text,
        },
        questions,
      });
      return { chunk, result };
    }),
  );
  const elapsedMs = performance.now() - started;

  const predictedByKey = new Map<string, { predicted?: string; probability?: number }>();
  let inputTokens = 0;
  let outputTokens = 0;
  for (const { chunk, result } of chunkOut) {
    inputTokens += result.usage.inputTokens ?? 0;
    outputTokens += result.usage.outputTokens ?? 0;
    for (const item of chunk.items) {
      const answer = result.answers[item.key];
      predictedByKey.set(item.key, {
        predicted:
          answer && answer.type === "choice" ? String(answer.choice) : undefined,
        probability:
          answer && answer.type === "choice"
            ? answer.probabilities?.[answer.choice]
            : undefined,
      });
    }
  }

  const siblings = prepared.seikai.map((item) => ({
    item,
    predicted: predictedByKey.get(item.key)?.predicted,
  }));

  const items: ItemResult[] = siblings.map(({ item, predicted }) => ({
    key: item.key,
    predicted,
    gold: item.answers,
    unordered: item.unordered,
    correct: scoreItem(item, predicted, siblings),
    points: item.points,
    probability: predictedByKey.get(item.key)?.probability,
    confidence: undefined,
  }));

  const missing = items.filter((i) => i.predicted == null);
  if (missing.length > 0) {
    throw new Error(
      `${prepared.subject.name}: 解答が欠けた ${missing.map((m) => m.key).join(",")}`,
    );
  }

  const { score, maxScore } = aggregateScore(prepared.seikai, items, {
    electiveDaimons: prepared.electiveDaimons,
    officialMax: prepared.officialMax,
  });
  return {
    subject: prepared.subject,
    items,
    correct: items.filter((i) => i.correct).length,
    total: items.length,
    score,
    maxScore,
    elapsedMs,
    inputTokens,
    outputTokens,
    tategaki: prepared.tategaki,
    extraLabels: prepared.extraTexts.map((e) => e.label),
  };
}

export function formatTable(results: SubjectResult[]): string {
  const rows = results.map((r) => {
    const pct =
      r.maxScore === 0 ? "n/a" : `${((100 * r.score) / r.maxScore).toFixed(1)}%`;
    const tokens = r.inputTokens ?? 0;
    const usd = ((tokens / 1_000_000) * 0.042).toFixed(5);
    return {
      科目: r.subject.name,
      得点: `${r.score}/${r.maxScore}`,
      率: pct,
      秒: (r.elapsedMs / 1000).toFixed(2),
      inTok: String(r.inputTokens ?? "-"),
      "$": usd,
      備考: [
        r.tategaki ? "縦書き復元" : "",
        ...r.extraLabels,
      ]
        .filter(Boolean)
        .join(","),
    };
  });
  const sumS = results.reduce((a, r) => a + r.score, 0);
  const sumM = results.reduce((a, r) => a + r.maxScore, 0);
  const sumMs = results.reduce((a, r) => a + r.elapsedMs, 0);
  const sumTok = results.reduce((a, r) => a + (r.inputTokens ?? 0), 0);
  rows.push({
    科目: "合計",
    得点: `${sumS}/${sumM}`,
    率: sumM === 0 ? "n/a" : `${((100 * sumS) / sumM).toFixed(1)}%`,
    秒: (sumMs / 1000).toFixed(2),
    inTok: String(sumTok),
    "$": ((sumTok / 1_000_000) * 0.042).toFixed(5),
    備考: "",
  });
  return renderRows(rows);
}

function renderRows(rows: Array<Record<string, string>>): string {
  const keys = Object.keys(rows[0] ?? {});
  const widths = Object.fromEntries(
    keys.map((k) => [
      k,
      Math.max(k.length, ...rows.map((r) => (r[k] ?? "").length)),
    ]),
  ) as Record<string, number>;
  const line = (r: Record<string, string>) =>
    keys.map((k) => (r[k] ?? "").padEnd(widths[k] ?? 0)).join("  ");
  const header = keys.map((k) => k.padEnd(widths[k] ?? 0)).join("  ");
  const rule = keys.map((k) => "-".repeat(widths[k] ?? 0)).join("  ");
  return [header, rule, ...rows.map(line)].join("\n");
}

export function missList(result: SubjectResult): string {
  const misses = result.items.filter((i) => !i.correct);
  if (misses.length === 0) return `${result.subject.name}: 全問一致`;
  return [
    `${result.subject.name} 誤り ${misses.length}件:`,
    ...misses.map(
      (m) =>
        `  ${m.key}  pred=${m.predicted ?? "?"} gold=${m.gold.join("/")} p=${m.probability?.toFixed(2) ?? "-"}`,
    ),
  ].join("\n");
}

export type { SeikaiItem };
