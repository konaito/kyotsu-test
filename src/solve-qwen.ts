import { gateway } from "@ai-sdk/gateway";
import { generateObject } from "ai";
import { z } from "zod";
import type { PreparedSubject } from "./extract.ts";
import { chunksFor, questionFor } from "./solve.ts";
import { scoreItem } from "./seikai.ts";
import {
  aggregateScore,
  type ItemResult,
  type SubjectResult,
} from "./demo-solve.ts";

export const QWEN_MODEL_ID = "alibaba/qwen3.5-flash";

export async function solveSubjectWithQwen(
  prepared: PreparedSubject,
  maxRetries = 2,
): Promise<SubjectResult> {
  const chunks = chunksFor(prepared);
  if (chunks.length === 0) {
    throw new Error(`${prepared.subject.name}: 大問に分割できなかった`);
  }

  const model = gateway(QWEN_MODEL_ID);
  const started = performance.now();

  const chunkOut = await Promise.all(
    chunks.map(async (chunk) => {
      const qList = chunk.items.map((item) => {
        const q = questionFor(prepared, item, chunk.parsed);
        const choices = Object.entries(q.criteria)
          .map(([k, v]) => `  [${k}] ${v}`)
          .join("\n");
        return `■ 解答キー: "${item.key}"\n${q.instructions}\n選択肢:\n${choices}`;
      });

      const prompt = [
        `【${prepared.subject.name} - ${chunk.label}】`,
        "本文中の [1] [2] [3] … はマークシートの解答番号または選択肢番号です。",
        "",
        "--- 本文 ---",
        chunk.text,
        "",
        "--- 設問一覧 ---",
        ...qList,
        "",
        "指示: 各解答キー（例: \"第1問:1\"）に対して、最も適当な選択肢番号・記号（例: 1, 2, \"ア\" 等）を JSON オブジェクト形式で出力してください。",
      ].join("\n");

      let lastError: unknown;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const res = await generateObject({
            model,
            schema: z.record(z.union([z.string(), z.number()])),
            prompt,
          });
          return { chunk, answers: res.object, usage: res.usage };
        } catch (e) {
          lastError = e;
          if (attempt < maxRetries) {
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          }
        }
      }
      throw lastError;
    }),
  );

  const elapsedMs = performance.now() - started;

  const predictedByKey = new Map<string, string>();
  let inputTokens = 0;
  let outputTokens = 0;

  for (const { chunk, answers, usage } of chunkOut) {
    inputTokens += usage?.promptTokens ?? 0;
    outputTokens += usage?.completionTokens ?? 0;

    // キーの正規化マップ（空白を除去して小文字化）
    const normAnswers = new Map<string, string>();
    for (const [k, v] of Object.entries(answers ?? {})) {
      const cleanKey = k.replace(/\s+/g, "");
      let valStr = String(v).trim();
      const match = valStr.match(/\d+|[ァ-ン]/);
      if (match) valStr = match[0];
      normAnswers.set(cleanKey, valStr);
    }

    for (const item of chunk.items) {
      const cleanItemKey = item.key.replace(/\s+/g, "");
      const pred =
        normAnswers.get(cleanItemKey) ??
        normAnswers.get(item.slot) ??
        normAnswers.get(item.key);
      predictedByKey.set(item.key, pred);
    }
  }

  const siblings = prepared.seikai.map((item) => ({
    item,
    predicted: predictedByKey.get(item.key),
  }));

  const items: ItemResult[] = siblings.map(({ item, predicted }) => ({
    key: item.key,
    predicted,
    gold: item.answers,
    unordered: item.unordered,
    correct: scoreItem(item, predicted, siblings),
    points: item.points,
    probability: undefined,
    confidence: undefined,
  }));

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
  };
}
