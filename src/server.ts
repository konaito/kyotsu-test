import index from "../web/index.html";
import { findSubjects, SUBJECTS } from "./catalog.ts";
import type { FilledDTO, PaperDTO, SubjectInfo } from "./dto.ts";
import { prepareSubject } from "./extract.ts";
import { demoSolve, solveSubject, type SubjectResult } from "./solve.ts";

const PORT = Number(process.env.PORT ?? 8787);

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function toPaper(result: {
  subject: { id: string; name: string; options: string[] };
  seikai: Array<{ key: string; slot: string; daimon: string | null }>;
  tategaki: boolean;
  extraTexts: Array<{ label: string }>;
}): PaperDTO {
  return {
    id: result.subject.id,
    name: result.subject.name,
    options: result.subject.options,
    tategaki: result.tategaki,
    extraLabels: result.extraTexts.map((e) => e.label),
    slots: result.seikai.map((s) => ({
      key: s.key,
      slot: s.slot,
      daimon: s.daimon,
    })),
  };
}

function toFilled(r: SubjectResult, demo: boolean): FilledDTO {
  return {
    id: r.subject.id,
    elapsedMs: r.elapsedMs,
    inputTokens: r.inputTokens,
    demo,
    items: r.items.map((i) => ({
      key: i.key,
      predicted: i.predicted,
      gold: i.gold,
      unordered: i.unordered,
      correct: i.correct,
      probability: i.probability,
    })),
  };
}

const server = Bun.serve({
  port: PORT,
  development: true,
  routes: {
    "/": index,
    "/api/subjects": {
      GET: () => {
        const list: SubjectInfo[] = SUBJECTS.map((s) => ({
          id: s.id,
          name: s.name,
        }));
        return Response.json(list);
      },
    },
    "/api/run": {
      GET: (req) => {
        const url = new URL(req.url);
        const ids = url.searchParams.get("subjects")?.split(",").filter(Boolean);
        const demo = url.searchParams.get("demo") === "1";
        let subjects;
        try {
          subjects = findSubjects(ids);
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : String(e) },
            { status: 400 },
          );
        }

        const stream = new ReadableStream({
          async start(controller) {
            const send = (event: string, data: unknown) => {
              controller.enqueue(sse(event, data));
            };
            try {
              send("hello", { demo, count: subjects.length });
              for (const subject of subjects) {
                send("status", {
                  phase: "extract",
                  id: subject.id,
                  name: subject.name,
                });
                const prepared = await prepareSubject(subject);
                send("paper", toPaper(prepared));
                send("status", {
                  phase: "solve",
                  id: subject.id,
                  name: subject.name,
                });
                if (demo) {
                  const r = demoSolve(prepared);
                  send("filled", toFilled(r, true));
                  continue;
                }
                try {
                  const r = await solveSubject(prepared);
                  send("filled", toFilled(r, false));
                } catch (e) {
                  send("error", {
                    id: subject.id,
                    name: subject.name,
                    error: e instanceof Error ? e.message : String(e),
                  });
                }
              }
              send("done", { ok: true });
            } catch (e) {
              send("fatal", {
                error: e instanceof Error ? e.message : String(e),
              });
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-cache",
            connection: "keep-alive",
          },
        });
      },
    },
  },
});

console.log(`http://localhost:${server.port}`);
