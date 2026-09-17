import { runSseResponse } from "../src/http.ts";

/**
 * Vercel /api/run — static import of src/http so the function bundle includes
 * fixtures + solve. AI SDK is lazy-loaded inside solveSubject (demo cold-start
 * never touches @ai-sdk/gateway / ai).
 */
export function GET(req: Request): Response {
  return runSseResponse(req);
}
