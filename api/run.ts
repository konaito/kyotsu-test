import { runSseResponse } from "../src/http.ts";

export function GET(req: Request): Response {
  return runSseResponse(req);
}

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method === "GET") return runSseResponse(req);
    return new Response("Method Not Allowed", { status: 405 });
  },
};
