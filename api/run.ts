/**
 * Vercel /api/run — demo stays AI-SDK-free via dynamic import;
 * live path loads src/http.ts (fixtures + solveSubject) only when needed.
 */
export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    if (url.searchParams.get("demo") === "1") {
      const { runDemoSse } = await import("../src/run-demo.ts");
      return runDemoSse(req);
    }
    if (!process.env.AI_GATEWAY_API_KEY) {
      return Response.json(
        {
          error:
            "AI_GATEWAY_API_KEY が無い。デモにチェックするか、Vercel に AI_GATEWAY_API_KEY を設定してください。",
        },
        { status: 400 },
      );
    }
    const { runSseResponse } = await import("../src/http.ts");
    return runSseResponse(req);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
