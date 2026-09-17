/**
 * Build committed JSON fixtures under data/subjects/ from cached PDFs via prepareSubject.
 *
 * Usage:
 *   bun run src/scripts/build-fixtures.ts
 *   bun run src/scripts/build-fixtures.ts --subject reading,kokugo
 *   bun run src/scripts/build-fixtures.ts --force   # overwrite existing
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { findSubjects, SUBJECTS } from "../catalog.ts";
import { prepareSubject } from "../extract.ts";
import { aggregateScore } from "../demo-solve.ts";
import type { SubjectFixture } from "../fixtures.ts";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function has(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main() {
  const ids = arg("--subject")?.split(",").map((s) => s.trim()).filter(Boolean);
  const subjects = findSubjects(ids);
  const force = has("--force");
  const outDir = join(process.cwd(), "data", "subjects");
  mkdirSync(outDir, { recursive: true });

  const ok: string[] = [];
  const skipped: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  for (const subject of subjects) {
    const dest = join(outDir, `${subject.id}.json`);
    if (!force && (await Bun.file(dest).exists())) {
      console.log(`skip ${subject.id} (exists; use --force to overwrite)`);
      skipped.push(subject.id);
      continue;
    }
    process.stdout.write(`build ${subject.id} (${subject.name})...\n`);
    try {
      const prepared = await prepareSubject(subject);
      const { maxScore } = aggregateScore(
        prepared.seikai,
        prepared.seikai.map((s) => ({
          key: s.key,
          predicted: undefined,
          gold: s.answers,
          unordered: s.unordered,
          correct: false,
          points: s.points,
          probability: undefined,
          confidence: undefined,
        })),
        {
          electiveDaimons: prepared.electiveDaimons,
          officialMax: prepared.officialMax,
        },
      );
      if (
        prepared.officialMax != null &&
        prepared.officialMax !== maxScore
      ) {
        console.warn(
          `  WARN ${subject.id}: sum(points)/elective maxScore=${maxScore} ≠ officialMax=${prepared.officialMax}`,
        );
      }
      const fixture: SubjectFixture = {
        id: subject.id,
        name: subject.name,
        tategaki: prepared.tategaki,
        examText: prepared.examText,
        extraTexts: prepared.extraTexts,
        seikai: prepared.seikai,
        maxScore,
        officialMax: prepared.officialMax,
        electiveDaimons: prepared.electiveDaimons,
      };
      await Bun.write(dest, `${JSON.stringify(fixture)}\n`);
      console.log(
        `  ok exam=${fixture.examText.length}chars seikai=${fixture.seikai.length} maxScore=${maxScore}${prepared.officialMax != null ? ` officialMax=${prepared.officialMax}` : ""}${fixture.tategaki ? " 縦書き" : ""} extras=${fixture.extraTexts.length}`,
      );
      ok.push(subject.id);
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.error(`  FAIL ${subject.id}: ${error}`);
      failed.push({ id: subject.id, error });
    }
  }

  console.log("\n=== summary ===");
  console.log(`ok: ${ok.length} ${ok.join(", ") || "(none)"}`);
  console.log(`skipped: ${skipped.length} ${skipped.join(", ") || "(none)"}`);
  console.log(`failed: ${failed.length}`);
  for (const f of failed) console.log(`  ${f.id}: ${f.error}`);

  // Write a small report for the PR / commit message
  const report = {
    ok: [...ok, ...skipped],
    newlyBuilt: ok,
    skippedExisting: skipped,
    failed,
    catalogIds: SUBJECTS.map((s) => s.id),
  };
  await Bun.write(
    join(process.cwd(), "data", "fixture-build-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  if (failed.length > 0 && ok.length === 0 && skipped.length === 0) {
    process.exit(1);
  }
}

await main();
