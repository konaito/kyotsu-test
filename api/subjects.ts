import { subjectsResponse } from "../src/http.ts";

export const GET = subjectsResponse;

export default {
  async fetch(req: Request): Promise<Response> {
    if (req.method === "GET") return subjectsResponse();
    return new Response("Method Not Allowed", { status: 405 });
  },
};
