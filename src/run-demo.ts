import { findSubjects } from "./catalog.ts";
import { demoSolve } from "./demo-solve.ts";
import type { FilledDTO, PaperDTO } from "./dto.ts";
import { hasFixture, listFixtureIds, prepareFromFixture } from "./fixtures.ts";

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function toPaper(prepared: ReturnType<typeof prepareFromFixture>): PaperDTO {
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

function toFilled(r: ReturnType<typeof demoSolve>, demo: boolean): FilledDTO {
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

/** Demo-only SSE — no AI SDK import graph. */
export function runDemoSse(req: Request): Response {
  const url = new URL(req.url);
  const ids = url.searchParams.get("subjects")?.split(",").filter(Boolean);
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
        error: `JSON fixture 未収録: ${missing.map((m) => m.id).join(", ")}（収録: ${listFixtureIds().join(", ")}）`,
      },
      { status: 400 },
    );
  }

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(enc.encode(sse(event, data)));
      };
      try {
        send("hello", { demo: true, count: subjects.length, source: "json-fixture" });
        for (const subject of subjects) {
          send("status", { phase: "extract", id: subject.id, name: subject.name });
          const prepared = prepareFromFixture(subject);
          send("paper", toPaper(prepared));
          send("status", { phase: "solve", id: subject.id, name: subject.name });
          send("filled", toFilled(demoSolve(prepared), true));
        }
        send("done", { ok: true });
      } catch (e) {
        send("fatal", { error: e instanceof Error ? e.message : String(e) });
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
