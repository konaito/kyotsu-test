import { readFileSync } from "node:fs";
import { join } from "node:path";
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
};

/** Known committed JSON fixtures (do not import JSON at module load — breaks Vercel). */
const FIXTURE_IDS = ["reading", "kokugo", "joho", "chiri-sougou"] as const;

export function listFixtureIds(): string[] {
  return [...FIXTURE_IDS];
}

export function hasFixture(id: string): boolean {
  return (FIXTURE_IDS as readonly string[]).includes(id);
}

function fixturePath(id: string): string {
  // process.cwd() is project root on Vercel; import.meta.dir works locally for Bun.
  const candidates = [
    join(process.cwd(), "data", "subjects", `${id}.json`),
    join(import.meta.dir, "..", "data", "subjects", `${id}.json`),
  ];
  for (const p of candidates) {
    try {
      readFileSync(p);
      return p;
    } catch {
      /* try next */
    }
  }
  throw new Error(`fixture file not found: ${id} (cwd=${process.cwd()})`);
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
  };
}
