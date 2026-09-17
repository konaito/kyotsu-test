import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { findSubjects, type Subject } from "./catalog.ts";
import type { PreparedSubject } from "./extract.ts";
import type { SeikaiItem } from "./seikai.ts";

export type SubjectFixture = {
  id: string;
  name: string;
  tategaki: boolean;
  examText: string;
  extraTexts: Array<{ label: string; text: string }>;
  seikai: SeikaiItem[];
  maxScore: number;
  /** From PDF title "(N点満点)" when parsed. */
  officialMax?: number;
  /** Pairs of 大問 that are mutually exclusive for 満点 (e.g. 第5問 vs 第6問). */
  electiveDaimons?: [string, string][];
};

/** Known committed JSON fixtures (do not import JSON at module load — breaks Vercel). */
const FIXTURE_IDS = ["kokugo", "chiri-tankyu", "nihonshi-tankyu", "sekaishi-tankyu", "koukyo-rinri", "koukyo-seiji", "chiri-sougou", "rekishi-sougou", "koukyo", "butsuri-kiso", "kagaku-kiso", "seibutsu-kiso", "chigaku-kiso", "butsuri", "kagaku", "seibutsu", "chigaku", "reading", "joho"] as const;

export function listFixtureIds(): string[] {
  return [...FIXTURE_IDS];
}

export function hasFixture(id: string): boolean {
  return (FIXTURE_IDS as readonly string[]).includes(id);
}

function fixturePath(id: string): string {
  // process.cwd() is project root on Vercel. import.meta.dir is Bun-only —
  // never pass undefined into join (Node throws before we can try cwd).
  const candidates = [join(process.cwd(), "data", "subjects", `${id}.json`)];
  const metaDir = (import.meta as { dir?: string }).dir;
  if (typeof metaDir === "string" && metaDir.length > 0) {
    candidates.push(join(metaDir, "..", "data", "subjects", `${id}.json`));
  }
  try {
    const here = fileURLToPath(new URL(".", import.meta.url));
    candidates.push(join(here, "..", "data", "subjects", `${id}.json`));
  } catch {
    /* import.meta.url unavailable */
  }
  const tried: string[] = [];
  for (const p of candidates) {
    tried.push(p);
    try {
      readFileSync(p);
      return p;
    } catch {
      /* try next */
    }
  }
  throw new Error(
    `fixture file not found: ${id} (cwd=${process.cwd()}; tried=${tried.join(" | ")})`,
  );
}

export function loadFixture(id: string): SubjectFixture {
  if (!hasFixture(id)) {
    throw new Error(
      `JSON fixture が無い科目: ${id}（あるもの: ${listFixtureIds().join(", ")}）`,
    );
  }
  const raw = readFileSync(fixturePath(id), "utf8");
  return JSON.parse(raw) as SubjectFixture;
}

/** Web / Vercel 用。PDF・pdftotext を使わず committed JSON から用意する。 */
export function prepareFromFixture(subjectOrId: Subject | string): PreparedSubject {
  const subject =
    typeof subjectOrId === "string" ? findSubjects([subjectOrId])[0]! : subjectOrId;
  const f = loadFixture(subject.id);
  return {
    subject,
    examText: f.examText,
    extraTexts: f.extraTexts,
    seikai: f.seikai.map((s) => ({ ...s })),
    tategaki: f.tategaki,
    officialMax: f.officialMax,
    electiveDaimons: f.electiveDaimons,
  };
}
