import { gateway } from "@ai-sdk/gateway";
import { generateText } from "ai";
import { findSubjects } from "../catalog.ts";
import { prepareFromFixture } from "../fixtures.ts";
import { chunksFor, questionFor } from "../solve.ts";
import { scoreItem } from "../seikai.ts";
import { aggregateScore, type ItemResult, type SubjectResult } from "../demo-solve.ts";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const QWEN_MODEL_ID = "alibaba/qwen3.5-flash";
const OUT_FILE = join(import.meta.dir, "../../data/qwen-benchmark.json");

interface BenchmarkStore {
  model: string;
  measuredAt: string;
  totalScore: number;
  totalMaxScore: number;
  accuracy: number;
  totalElapsedMs: number;
  subjects: Array<{
    id: string;
    name: string;
    score: number;
    maxScore: number;
    accuracy: number;
    correct: number;
    total: number;
    elapsedMs: number;
    items: Array<{
      key: string;
      predicted?: string;
      gold: string[];
      correct: boolean;
      points: number;
    }>;
  }>;
}

function loadExisting(): BenchmarkStore {
  if (existsSync(OUT_FILE)) {
    try {
      return JSON.parse(readFileSync(OUT_FILE, "utf-8"));
    } catch {}
  }
  return {
    model: QWEN_MODEL_ID,
    measuredAt: new Date().toISOString(),
    totalScore: 0,
    totalMaxScore: 0,
    accuracy: 0,
    totalElapsedMs: 0,
    subjects: [],
  };
}

function saveStore(store: BenchmarkStore) {
  store.totalScore = store.subjects.reduce((sum, s) => sum + s.score, 0);
  store.totalMaxScore = store.subjects.reduce((sum, s) => sum + s.maxScore, 0);
  store.accuracy = store.totalMaxScore > 0 ? (store.totalScore / store.totalMaxScore) * 100 : 0;
  store.totalElapsedMs = store.subjects.reduce((sum, s) => sum + s.elapsedMs, 0);
  store.measuredAt = new Date().toISOString();
  writeFileSync(OUT_FILE, JSON.stringify(store, null, 2), "utf-8");
}

async function solveSubject(subjectId: string, maxRetries = 3): Promise<SubjectResult> {
  const [sub] = findSubjects([subjectId]);
  if (!sub) throw new Error(`Unknown subject: ${subjectId}`);
  const prep = prepareFromFixture(sub);

  const chunks = chunksFor(prep);
  const qList = chunks.flatMap((c) =>
    c.items.map((it) => {
      const q = questionFor(prep, it, c.parsed);
      const choices = Object.entries(q.criteria)
        .map(([k, v]) => `  [${k}] ${v}`)
        .join("\n");
      return `■ 解答キー: "${it.key}" (${c.label})\n${q.instructions}\n選択肢:\n${choices}`;
    }),
  );

  const prompt = [
    `【${prep.subject.name}】の全問解答を行ってください。`,
    "本文中の [1] [2] [3] … はマークシートの解答番号または選択肢番号です。",
    "",
    "--- 問題本文 ---",
    prep.examText,
    "",
    "--- 設問一覧 ---",
    ...qList,
    "",
    "指示: すべての解答キーに対して、選んだ最も適当な選択肢の番号または文字（例: \"1\", \"2\", \"ア\" など）を JSON オブジェクト形式で出力してください。",
    "キーは設問一覧にある解答キー文字列（例: \"第1問:1\"）を使用してください。",
    "出力例: { \"第1問:1\": \"2\", \"第1問:2\": \"4\" }",
    "必ず JSON 形式で出力してください。",
  ].join("\n");

  const model = gateway(QWEN_MODEL_ID);
  const started = performance.now();

  let textOut = "";
  let usageOut: any = null;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Qwen] Solving ${prep.subject.name} (attempt ${attempt + 1}/${maxRetries + 1})...`);
      const res = await generateText({
        model,
        prompt,
      });
      textOut = res.text;
      usageOut = res.usage;
      break;
    } catch (e: any) {
      lastErr = e;
      console.error(`[Qwen] Error on ${prep.subject.name} (attempt ${attempt + 1}):`, e?.message ?? e);
      if (attempt < maxRetries) {
        const backoff = 3000 * Math.pow(2, attempt);
        console.log(`Waiting ${backoff}ms before retry...`);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }

  if (!textOut) {
    throw lastErr ?? new Error(`Failed to generate for ${prep.subject.name}`);
  }

  const elapsedMs = performance.now() - started;

  // Extract JSON from response text
  let rawJson: Record<string, any> = {};
  try {
    const jsonMatch = textOut.match(/```(?:json)?\s*([\s\S]*?)\s*```/) ?? textOut.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      rawJson = JSON.parse(jsonMatch[1]);
    } else {
      rawJson = JSON.parse(textOut);
    }
  } catch (e) {
    console.warn(`[Qwen] JSON parse failed on ${prep.subject.name}, falling back to key extraction:`, e);
    const pairRegex = /["']?([^"':\n]+)["']?\s*:\s*["']?([^"',}\n]+)["']?/g;
    let m;
    while ((m = pairRegex.exec(textOut)) !== null) {
      rawJson[m[1].trim()] = m[2].trim();
    }
  }

  const answersMap = new Map<string, string>();
  for (const [k, v] of Object.entries(rawJson)) {
    const normKey = k.replace(/\s+/g, "");
    let valStr = String(v ?? "");
    const digitMatch = valStr.match(/\d+|[ァ-ン]/);
    if (digitMatch) valStr = digitMatch[0];
    answersMap.set(normKey, valStr);

    const slotMatch = normKey.match(/:(\d+)$/);
    if (slotMatch) {
      answersMap.set(slotMatch[1], valStr);
    }
  }

  const siblings = prep.seikai.map((item) => {
    const normKey = item.key.replace(/\s+/g, "");
    const predicted = answersMap.get(normKey) ?? answersMap.get(item.slot);
    return { item, predicted };
  });

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

  const { score, maxScore } = aggregateScore(prep.seikai, items, {
    electiveDaimons: prep.electiveDaimons,
    officialMax: prep.officialMax,
  });

  return {
    subject: prep.subject,
    items,
    correct: items.filter((i) => i.correct).length,
    total: items.length,
    score,
    maxScore,
    elapsedMs,
    inputTokens: usageOut?.promptTokens ?? 0,
    outputTokens: usageOut?.completionTokens ?? 0,
  };
}

// Concurrency pool helper
async function mapConcurrent<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  const workers = Array.from({ length: concurrency }, async () => {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      results[idx] = await fn(items[idx]);
    }
  });

  await Promise.all(workers);
  return results;
}

async function main() {
  const allSubjects = findSubjects([]);
  const store = loadExisting();

  console.log(`Starting Qwen 3.5 Benchmark for ${allSubjects.length} subjects...`);
  console.log(`Model: ${QWEN_MODEL_ID}`);

  // Determine subjects needing evaluation
  const pending = allSubjects.filter(sub => !store.subjects.some(s => s.id === sub.id));
  console.log(`Already completed: ${store.subjects.length}, Pending: ${pending.length}`);

  // Run with concurrency = 2
  await mapConcurrent(pending, 2, async (sub) => {
    try {
      const result = await solveSubject(sub.id);
      const acc = result.maxScore > 0 ? (result.score / result.maxScore) * 100 : 0;
      console.log(`✅ [${result.subject.name}] ${result.score}/${result.maxScore}点 (${acc.toFixed(1)}%) 正答: ${result.correct}/${result.total} タイム: ${(result.elapsedMs / 1000).toFixed(1)}s`);

      const existingIdx = store.subjects.findIndex((s) => s.id === result.subject.id);
      const entry = {
        id: result.subject.id,
        name: result.subject.name,
        score: result.score,
        maxScore: result.maxScore,
        accuracy: acc,
        correct: result.correct,
        total: result.total,
        elapsedMs: result.elapsedMs,
        items: result.items.map((it) => ({
          key: it.key,
          predicted: it.predicted,
          gold: it.gold,
          correct: it.correct,
          points: it.points,
        })),
      };

      if (existingIdx >= 0) {
        store.subjects[existingIdx] = entry;
      } else {
        store.subjects.push(entry);
      }
      saveStore(store);
      console.log(`[Store Updated] Cumulative score: ${store.totalScore}/${store.totalMaxScore} (${store.accuracy.toFixed(1)}%)`);
    } catch (e) {
      console.error(`❌ Failed to solve ${sub.name}:`, e);
    }
  });

  console.log("\n==========================================");
  console.log("🎉 Qwen 3.5 Benchmark Complete!");
  console.log(`総合得点: ${store.totalScore}/${store.totalMaxScore} (${store.accuracy.toFixed(1)}%)`);
  console.log(`総所要時間: ${(store.totalElapsedMs / 1000).toFixed(1)}s`);
  console.log(`結果ファイル: ${OUT_FILE}`);
  console.log("==========================================\n");
}

main().catch(console.error);
