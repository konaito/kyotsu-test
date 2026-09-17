export { listSubjects, subjectsResponse } from "./subjects-api.ts";
import { findSubjects } from "./catalog.ts";
import type { FilledDTO, PaperDTO } from "./dto.ts";
import { hasFixture, listFixtureIds, prepareFromFixture } from "./fixtures.ts";
import { demoSolve, type SubjectResult } from "./demo-solve.ts";
import { solveSubject } from "./solve.ts";

export function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function toPaper(prepared: {
  subject: { id: string; name: string; options: string[] };
  seikai: Array<{ key: string; slot: string; daimon: string | null }>;
  tategaki: boolean;
  extraTexts: Array<{ label: string }>;
}): PaperDTO {
  return {
    id: prepared.subject.id,
    name: prepared.subject.name,
    options: prepared.subject.options,
    tategaki: prepared.tategaki,
    extraLabels: prepared.extraTexts.map((e) => e.label),
    slots: prepared.seikai.map((s) => ({
      key: s.key,
      slot: s.slot,
      daimon: s.daimon,
    })),
  };
}

export function toFilled(r: SubjectResult, demo: boolean): FilledDTO {
  return {
    id: r.subject.id,
    elapsedMs: r.elapsedMs,
    inputTokens: r.inputTokens,
    demo,
    score: r.score,
    maxScore: r.maxScore,
    items: r.items.map((i) => ({
      key: i.key,
      predicted: i.predicted,
      gold: i.gold,
      unordered: i.unordered,
      correct: i.correct,
      points: i.points,
      probability: i.probability,
    })),
  };
}

/** SSE run using JSON fixtures only (Vercel / web). */
export function runSseResponse(req: Request): Response {
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

  const missing = subjects.filter((s) => !hasFixture(s.id));
  if (missing.length > 0) {
    return Response.json(
      {
        error: `Web/Vercel 経路は JSON fixture 必須。未収録: ${missing
          .map((m) => m.id)
          .join(", ")}（収録: ${listFixtureIds().join(", ")}）`,
      },
      { status: 400 },
    );
  }

  if (!demo && !process.env.AI_GATEWAY_API_KEY) {
    return Response.json(
      {
        error:
          "AI_GATEWAY_API_KEY が無い。デモにチェックするか、Vercel に AI_GATEWAY_API_KEY を設定してください。",
      },
      { status: 400 },
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(enc.encode(sse(event, data)));
      };
      try {
        send("hello", { demo, count: subjects.length, source: "json-fixture" });
        for (const subject of subjects) {
          send("status", {
            phase: "extract",
            id: subject.id,
            name: subject.name,
          });
          const prepared = prepareFromFixture(subject);
          send("paper", toPaper(prepared));
          send("status", {
            phase: "solve",
            id: subject.id,
            name: subject.name,
          });
          if (demo) {
            send("filled", toFilled(demoSolve(prepared), true));
            continue;
          }
          try {
            send("filled", toFilled(await solveSubject(prepared), false));
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
}
