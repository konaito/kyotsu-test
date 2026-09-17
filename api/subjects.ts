import { subjectsResponse } from "../src/subjects-api.ts";

export function GET(): Response {
  return subjectsResponse();
}
