export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (url.searchParams.get("demo") === "1") {
    const { runDemoSse } = await import("../src/run-demo.ts");
    return runDemoSse(req);
  }
  const { runSseResponse } = await import("../src/http.ts");
  return runSseResponse(req);
}
