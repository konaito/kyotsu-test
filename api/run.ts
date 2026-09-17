import { readFileSync } from "node:fs";
import { join } from "node:path";

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function load(id: string) {
  const p = join(process.cwd(), "data", "subjects", `${id}.json`);
  return JSON.parse(readFileSync(p, "utf8"));
}

export function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const demo = url.searchParams.get("demo") === "1";
    const ids = (url.searchParams.get("subjects") ?? "reading")
      .split(",")
      .filter(Boolean);
    if (!demo) {
      return Response.json(
        { error: "Non-demo requires AI_GATEWAY_API_KEY path; use ?demo=1 for now." },
        { status: 400 },
      );
    }

    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        const send = (e: string, d: unknown) =>
          controller.enqueue(enc.encode(sse(e, d)));
        try {
          send("hello", { demo: true, count: ids.length, source: "json-fixture" });
          for (const id of ids) {
            const fix = load(id);
            send("status", { phase: "extract", id, name: fix.name });
            send("paper", {
              id,
              name: fix.name,
              options: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
              tategaki: !!fix.tategaki,
              extraLabels: (fix.extraTexts ?? []).map((e: { label: string }) => e.label),
              slots: fix.seikai.map((s: { key: string; slot: string; daimon: string | null }) => ({
                key: s.key,
                slot: s.slot,
                daimon: s.daimon,
              })),
            });
            send("status", { phase: "solve", id, name: fix.name });
            // Deterministic demo: mark ~80% correct by hash
            const items = fix.seikai.map(
              (s: {
                key: string;
                answers: string[];
                unordered: boolean;
                points: number;
                groupId: string;
              }) => {
                let h = 2166136261;
                for (let i = 0; i < s.key.length; i++) {
                  h ^= s.key.charCodeAt(i);
                  h = Math.imul(h, 16777619);
                }
                const wrong = (h >>> 0) % 5 === 0;
                const predicted = wrong ? "9" : s.answers[0];
                const correct = !wrong && s.answers.includes(predicted);
                return {
                  key: s.key,
                  predicted,
                  gold: s.answers,
                  unordered: s.unordered,
                  correct,
                  points: s.points,
                  probability: correct ? 0.91 : 0.42,
                };
              },
            );
            const seen = new Set<string>();
            let score = 0;
            let maxScore = 0;
            for (const s of fix.seikai as Array<{
              key: string;
              points: number;
              groupId: string;
            }>) {
              if (seen.has(s.groupId)) continue;
              seen.add(s.groupId);
              maxScore += s.points;
              const it = items.find((i: { key: string }) => i.key === (
                fix.seikai as Array<{ key: string; groupId: string }>
              ).find((x) => x.groupId === s.groupId)!.key);
              if (it?.correct) score += s.points;
            }
            // Fix score aggregation properly
            const byKey = new Map(items.map((i: { key: string; correct: boolean }) => [i.key, i]));
            score = 0;
            maxScore = 0;
            seen.clear();
            for (const s of fix.seikai as Array<{
              key: string;
              points: number;
              groupId: string;
            }>) {
              if (seen.has(s.groupId)) continue;
              seen.add(s.groupId);
              maxScore += s.points;
              if (byKey.get(s.key)?.correct) score += s.points;
            }
            send("filled", {
              id,
              elapsedMs: 220 + items.length * 2.4,
              inputTokens: Math.round(String(fix.examText ?? "").length * 0.4),
              demo: true,
              score,
              maxScore,
              items,
            });
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
      },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
