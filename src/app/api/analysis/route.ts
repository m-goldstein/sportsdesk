import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  analyzeGame,
  AnalysisError,
  configuredModel,
  constructPacket,
  resolveAnalysisGame,
} from "@/lib/analysis-service";
import { validDate } from "@/lib/providers";

export const runtime = "nodejs";
export const maxDuration = 240;
const requestSchema = z
  .object({
    league: z.enum(["NBA", "NFL", "MLB", "NHL", "NCAAM"]),
    id: z.string().regex(/^(\d{6,12}|demo-\d{1,2})$/),
    date: z.string().refine(validDate),
  })
  .strict();
const headers = { "Cache-Control": "no-store" };
function failure(error: unknown) {
  if (error instanceof AnalysisError)
    return { message: error.message, status: error.status };
  const status =
    typeof error === "object" && error && "statusCode" in error
      ? Number(error.statusCode)
      : 0;
  if (status === 401 || status === 403)
    return {
      message:
        "OpenAI rejected the configured key or model access. Check OPENAI_API_KEY and OPENAI_MODEL in Vercel, then redeploy.",
      status: 502,
    };
  if (status === 429)
    return {
      message:
        "OpenAI's rate or billing quota was reached. Check the API project's quota and try again later.",
      status: 429,
    };
  return {
    message:
      "GPT analysis could not finish or its evidence checks failed. Your research packet is still available; try again shortly.",
    status: 502,
  };
}
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const input = requestSchema.safeParse({
    league: q.get("league"),
    id: q.get("id"),
    date: q.get("date"),
  });
  if (!input.success)
    return NextResponse.json(
      {
        error:
          "Provide a supported league, event ID and valid YYYY-MM-DD date.",
      },
      { status: 400, headers },
    );
  try {
    const game = await resolveAnalysisGame(
      input.data.league,
      input.data.id,
      input.data.date,
    );
    const packet = await constructPacket(game);
    return NextResponse.json(
      {
        packet,
        configured: game.demo || Boolean(process.env.OPENAI_API_KEY),
        model: configuredModel(),
        canAnalyze: game.state !== "post",
        disabledReason:
          game.state === "post"
            ? "Completed games are available for review only; retrospective GPT predictions are disabled."
            : null,
      },
      { headers },
    );
  } catch (error) {
    const result = failure(error);
    return NextResponse.json(
      { error: result.message },
      { status: result.status, headers },
    );
  }
}
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  // The standalone server's internal URL can differ from the visitor's host.
  const publicHost =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    request.nextUrl.host;
  let sameOrigin = true;
  if (origin) {
    try {
      const url = new URL(origin);
      sameOrigin =
        ["http:", "https:"].includes(url.protocol) && url.host === publicHost;
    } catch {
      sameOrigin = false;
    }
  }
  if (!sameOrigin)
    return NextResponse.json(
      { error: "Analysis requests must come from this workspace." },
      { status: 403, headers },
    );
  if (!request.headers.get("content-type")?.includes("application/json"))
    return NextResponse.json(
      { error: "Use application/json." },
      { status: 415, headers },
    );
  if (Number(request.headers.get("content-length") ?? 0) > 2048)
    return NextResponse.json(
      { error: "Analysis requests may contain only matchup identifiers." },
      { status: 413, headers },
    );
  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > 2048)
      return NextResponse.json(
        { error: "Request too large." },
        { status: 413, headers },
      );
    body = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request." },
      { status: 400, headers },
    );
  }
  const input = requestSchema.safeParse(body);
  if (!input.success)
    return NextResponse.json(
      {
        error:
          "Provide only a supported league, event ID and valid date. Client-supplied evidence and prompts are not accepted.",
      },
      { status: 400, headers },
    );
  if (!input.data.id.startsWith("demo-") && !process.env.OPENAI_API_KEY)
    return NextResponse.json(
      {
        error:
          "GPT analysis is not configured. Add OPENAI_API_KEY to this deployment and redeploy.",
      },
      { status: 503, headers },
    );
  try {
    const game = await resolveAnalysisGame(
      input.data.league,
      input.data.id,
      input.data.date,
    );
    if (game.state === "post")
      throw new AnalysisError(
        "Completed games cannot receive retrospective GPT predictions.",
        409,
      );
    let closed = false;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: unknown) => {
          if (!closed) {
            try {
              controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
            } catch {
              closed = true;
            }
          }
        };
        const heartbeat = setInterval(() => send({ type: "heartbeat" }), 15000);
        try {
          send({ type: "stage", stage: "packet" });
          const result = await analyzeGame(game, (stage) =>
            send({ type: "stage", stage }),
          );
          send({ type: "result", result });
        } catch (error) {
          const result = failure(error);
          send({ type: "error", error: result.message });
        } finally {
          clearInterval(heartbeat);
          if (!closed) {
            closed = true;
            controller.close();
          }
        }
      },
      cancel() {
        closed = true;
      },
    });
    return new Response(stream, {
      headers: {
        ...headers,
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    const result = failure(error);
    return NextResponse.json(
      { error: result.message },
      { status: result.status, headers },
    );
  }
}
