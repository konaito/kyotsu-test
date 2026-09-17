import { runSseResponse } from "../src/http.ts";

export function GET(req: Request): Response {
  return runSseResponse(req);
}
