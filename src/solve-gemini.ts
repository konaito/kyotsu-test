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

export const GEMINI_MODEL_ID = "google/gemini-2.5-flash-lite";

export async function solveSubjectWithGemini(
  prepared: PreparedSubject,
  maxRetries = 2,
): Promise<SubjectResult> {
  const chunks = chunksFor(prepared);
  if (chunks.length === 0) {
    throw new Error(`${prepared.subject.name}: 大問に分割できなかった`);
  }

  const model = gateway(GEMINI_MODEL_ID);
  const started = performance.now();

  const chunkOut = await Promise.all(
    chunks.map(async (chunk) => {
      const qList = chunk.items.map((item) => {
        const q = questionFor(prepared, item, chunk.parsed);
        const choices = Object.entries(q.criteria)
          .map(([k, v]) => `  [${k}] ${v}`)
          .join("\n");
        return `■ 解答キー "${item.key}":\n${q.instructions}\n選択肢:\n${choices}`;
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
        "指示: 各解答キー（例: \"第1問:1\"）に対して、最も適当な選択肢の番号・文字（例: \"1\", \"2\", \"ア\" 等）を answers オブジェクトにマッピングしてください。",
      ].join("\n");

      let lastError: unknown;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const res = await generateObject({
            model,
            schema: z.object({
              answers: z
                .record(z.string())
                .describe("各解答キーと選択肢番号の対応マップ"),
            }),
            prompt,
          });
          return { chunk, answers: res.object.answers, usage: res.usage };
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
    for (const item of chunk.items) {
      let pred = answers[item.key] ?? answers[item.slot];
      if (pred) {
        // [1] のようなブラケット付きなら数字だけ抽出
        const match = pred.match(/\d+|[ァ-ン]/);
        if (match) pred = match[0];
      }
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
