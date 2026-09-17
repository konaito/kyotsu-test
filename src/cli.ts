import { findSubjects, SUBJECTS } from "./catalog.ts";
import { prepareSubject } from "./extract.ts";
import {
  formatTable,
  missList,
  pingJev,
  solveSubject,
  type SubjectResult,
} from "./solve.ts";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function has(flag: string): boolean {
  return process.argv.includes(flag);
}

async function pool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      const item = items[i];
      if (item === undefined) break;
      out[i] = await fn(item);
    }
  }
  const n = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

async function main() {
  if (has("--help") || has("-h")) {
    console.log(`2025共通テスト（数学以外・新課程本試）を jev で解く

使い方:
  bun run src/cli.ts
  bun run src/cli.ts --subject reading,kokugo
  bun run src/cli.ts --dry-run
  bun run src/cli.ts --list

環境変数:
  AI_GATEWAY_API_KEY   Vercel AI Gateway のキー (.env 可)

jevはテキストだけ見る。図表はPDFから文字が取れた範囲だけ。
リスニングは公式スクリプトを state に入れる（音声は使わない）。
旧課程・数学・独仏中韓は対象外。
`);
    console.log("科目id:");
    for (const s of SUBJECTS) console.log(`  ${s.id.padEnd(20)} ${s.name}`);
    return;
  }

  if (has("--list")) {
    for (const s of SUBJECTS) console.log(`${s.id}\t${s.name}`);
    return;
  }

  const ids = arg("--subject")?.split(",").map((s) => s.trim()).filter(Boolean);
  const subjects = findSubjects(ids);
  const dry = has("--dry-run");
  const conc = Number(arg("--concurrency") ?? "3");

  if (!process.env.AI_GATEWAY_API_KEY && !dry) {
    throw new Error("AI_GATEWAY_API_KEY が無い");
  }

  if (!dry) {
    process.stdout.write("jev ping... ");
    await pingJev();
    console.log("ok");
  }

  const results: SubjectResult[] = [];
  const failures: Array<{ id: string; error: string }> = [];

  const prepared = await pool(subjects, Math.min(conc, 4), async (subject) => {
    process.stdout.write(`extract ${subject.id}...\n`);
    try {
      const p = await prepareSubject(subject);
      console.log(
        `  ${subject.id}: exam=${p.examText.length}chars seikai=${p.seikai.length}問${p.tategaki ? " 縦書き" : ""}`,
      );
      return p;
    } catch (e) {
      failures.push({
        id: subject.id,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  });

  if (dry) {
    for (const p of prepared) {
      if (!p) continue;
      console.log(`\n# ${p.subject.name}`);
      for (const item of p.seikai) {
        console.log(
          `  ${item.key} -> ${item.answers.join("/")} ${item.unordered ? "(順不同)" : ""}`,
        );
      }
    }
    if (failures.length > 0) {
      console.error("\n抽出失敗:");
      for (const f of failures) console.error(`  ${f.id}: ${f.error}`);
      process.exitCode = 1;
    }
    return;
  }

  const ready = prepared.filter((p) => p != null);
  const solved = await pool(ready, conc, async (p) => {
    process.stdout.write(`solve ${p.subject.id} (${p.seikai.length}問)...\n`);
    const r = await solveSubject(p);
    console.log(
      `  ${p.subject.id}: ${r.correct}/${r.total} ${(r.elapsedMs / 1000).toFixed(2)}s`,
    );
    return r;
  });
  results.push(...solved);

  console.log("\n" + formatTable(results) + "\n");
  for (const r of results) console.log(missList(r));

  const stamp = new Date().toISOString().replaceAll(":", "-");
  const outPath = `.cache/results/${stamp}.json`;
  await Bun.$`mkdir -p .cache/results`.quiet();
  await Bun.write(
    outPath,
    JSON.stringify(
      {
        model: "typesafe-ai/jev",
        at: new Date().toISOString(),
        results,
        failures,
      },
      null,
      2,
    ),
  );
  console.log(`\nwrote ${outPath}`);

  if (failures.length > 0) {
    console.error("\n失敗した科目:");
    for (const f of failures) console.error(`  ${f.id}: ${f.error}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
