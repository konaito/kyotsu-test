import { findSubjects, type Subject } from "./catalog.ts";
import type { PreparedSubject } from "./extract.ts";
import type { SeikaiItem } from "./seikai.ts";

import reading from "../data/subjects/reading.json";
import kokugo from "../data/subjects/kokugo.json";
import joho from "../data/subjects/joho.json";
import chiriSougou from "../data/subjects/chiri-sougou.json";

export type SubjectFixture = {
  id: string;
  name: string;
  tategaki: boolean;
  examText: string;
  extraTexts: Array<{ label: string; text: string }>;
  seikai: SeikaiItem[];
  maxScore: number;
};

const FIXTURES: Record<string, SubjectFixture> = {
  reading: reading as SubjectFixture,
  kokugo: kokugo as SubjectFixture,
  joho: joho as SubjectFixture,
  "chiri-sougou": chiriSougou as SubjectFixture,
};

export function listFixtureIds(): string[] {
  return Object.keys(FIXTURES);
}

export function hasFixture(id: string): boolean {
  return id in FIXTURES;
}

export function loadFixture(id: string): SubjectFixture {
  const f = FIXTURES[id];
  if (!f) {
    throw new Error(
      `JSON fixture が無い科目: ${id}（あるもの: ${listFixtureIds().join(", ")}）`,
    );
  }
  return f;
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
