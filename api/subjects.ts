import { SUBJECTS } from "../src/catalog.ts";
import { hasFixture } from "../src/fixtures.ts";

export function GET(): Response {
  return Response.json(
    SUBJECTS.map((s) => ({
      id: s.id,
      name: s.name,
      hasFixture: hasFixture(s.id),
    })),
  );
}
