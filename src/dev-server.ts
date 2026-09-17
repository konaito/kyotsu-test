import { existsSync } from "node:fs";
import { join } from "node:path";
import indexHtml from "../web/index.html";
import { runSseResponse, subjectsResponse } from "./http.ts";

const PORT = Number(process.env.PORT ?? 8787);
const PUBLIC = join(import.meta.dir, "../public");
const usePublic = existsSync(join(PUBLIC, "index.html"));

const server = Bun.serve({
  port: PORT,
  development: process.env.NODE_ENV !== "production",
  routes: {
    "/": usePublic
      ? new Response(Bun.file(join(PUBLIC, "index.html")))
      : indexHtml,
    "/api/subjects": {
      GET: () => subjectsResponse(),
    },
    "/api/run": {
      GET: (req) => runSseResponse(req),
    },
  },
  async fetch(req) {
    if (!usePublic) return new Response("Not Found", { status: 404 });
    const url = new URL(req.url);
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(join(PUBLIC, path));
    if (await file.exists()) return new Response(file);
    return new Response("Not Found", { status: 404 });
  },
});

console.log(
  `http://localhost:${server.port}  (${usePublic ? "public/" : "web/ HTML import"} + JSON fixtures)`,
);
