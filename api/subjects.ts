import { subjectsResponse } from "../src/http.ts";

export function GET(): Response {
  return subjectsResponse();
}
