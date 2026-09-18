import { findSubjects } from "../catalog.ts";
import { prepareFromFixture, listFixtureIds } from "../fixtures.ts";
import { solveSubjectWithGemini } from "../solve-gemini.ts";
import type { SubjectResult } from "../demo-solve.ts";

async function pool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      const item = items[i];
      if (item === undefined) break;
      out[i] = await fn(item, i);
    }
  }
  const n = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

async function main() {
  const fixtureIds = listFixtureIds();
  const subjects = findSubjects(fixtureIds);
  console.log(`Starting Gemini 2.5 Flash Lite benchmark for ${subjects.length} subjects...`);

  const results: Record<
    string,
    {
      name: string;
      score: number;
      maxScore: number;
      correct: number;
      total: number;
      pct: number;
      elapsedMs: number;
    }
  > = {};

  const t0 = performance.now();

  await pool(subjects, 3, async (subject, idx) => {
    const prep = prepareFromFixture(subject);
    const start = performance.now();
    try {
      console.log(`[${idx + 1}/${subjects.length}] Solving ${subject.name} (${subject.id})...`);
      const res = await solveSubjectWithGemini(prep);
      const pct = Number(((res.score / res.maxScore) * 100).toFixed(1));
      const elapsed = Number((res.elapsedMs / 1000).toFixed(2));
      console.log(
        `✓ ${subject.name}: ${res.score}/${res.maxScore} (${pct}%) in ${elapsed}s [${res.correct}/${res.total}問]`,
      );
      results[subject.id] = {
        name: subject.name,
        score: res.score,
        maxScore: res.maxScore,
        correct: res.correct,
        total: res.total,
        pct,
        elapsedMs: res.elapsedMs,
      };
    } catch (e) {
      console.error(`✗ ${subject.name} failed:`, e instanceof Error ? e.message : e);
    }
  });

  const totalTimeSec = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(`\nCompleted in ${totalTimeSec}s!`);

  let totalScore = 0;
  let totalMax = 0;
  for (const r of Object.values(results)) {
    totalScore += r.score;
    totalMax += r.maxScore;
  }
  const totalPct = totalMax > 0 ? Number(((totalScore / totalMax) * 100).toFixed(1)) : 0;

  const data = {
    model: "google/gemini-2.5-flash-lite",
    timestamp: new Date().toISOString(),
    totalScore,
    totalMax,
    totalPct,
    subjects: results,
  };

  const outPath = "data/gemini-benchmark.json";
  await Bun.write(outPath, JSON.stringify(data, null, 2));
  console.log(`Saved benchmark results to ${outPath}`);
  console.log(`Total: ${totalScore}/${totalMax} (${totalPct}%)`);
}

main().catch((e) => {
  console.error("Benchmark error:", e);
  process.exit(1);
});
