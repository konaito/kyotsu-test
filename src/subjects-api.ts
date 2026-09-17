import { SUBJECTS } from "./catalog.ts";
import type { SubjectInfo } from "./dto.ts";
import { hasFixture } from "./fixtures.ts";

export function listSubjects(): SubjectInfo[] {
  return SUBJECTS.map((s) => ({
    id: s.id,
    name: s.name,
    hasFixture: hasFixture(s.id),
  }));
}

export function subjectsResponse(): Response {
  return Response.json(listSubjects());
}
