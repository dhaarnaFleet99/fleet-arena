import { NextRequest } from "next/server";
import { createEdgeServiceClient } from "@/lib/supabase/edge";
import { getOpenRouterKey, OPENROUTER_BASE } from "@/lib/openrouter";
import { checkStreamRateLimit } from "@/lib/upstashRateLimit";

// Node.js serverless runtime with a high maxDuration cap.
// Edge was tried but its hard 30 s wall-clock limit kills multi-model streams.
export const dynamic = "force-dynamic";
export const maxDuration = 300; // Vercel Pro: up to 300 s per streaming function

const MODEL_TIMEOUT_MS = 90_000; // 90 s per model before we abort and emit an error
const MAX_RETRIES = 2; // retry on 429/503 before surfacing to user
const RETRY_CAP_MS = 15_000; // never wait more than 15 s between retries

// Structured log prefix so Vercel logs are greppable by turn.
const tag = (turnId: string, slot: string) => `[stream:${turnId}:${slot}]`;

// Read the OpenRouter error body and extract a useful message.
async function readOpenRouterError(resp: Response): Promise<string> {
  try {
    const text = await resp.text();
    const json = JSON.parse(text);
    const msg: string = json?.error?.message ?? json?.message ?? text;
    return `${resp.status} ${msg.slice(0, 300)}`;
  } catch {
    return `HTTP ${resp.status}`;
  }
}

// Map low-level JS errors to messages that are useful to the user.
function friendlyError(err: unknown): string {
  const name = (err as Error)?.name;
  const message = (err as Error)?.message ?? String(err);
  if (name === "AbortError") return "Model timed out — no response within 90 s";
  if (name === "TypeError" && message.includes("fetch")) return "Network error reaching OpenRouter";
  return message;
}

export async function POST(req: NextRequest) {
  // ── Rate limiting (Upstash Redis — global across all Vercel instances) ────
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const { ok, retryAfter } = await checkStreamRateLimit(ip);
  if (!ok) {
    console.warn("[stream] rate-limited", { ip, retryAfter });
    return new Response("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": String(retryAfter) },
    });
  }

  const { sessionId, turnId, modelIds, messages } = await req.json() as {
    sessionId: string;
    turnId: string;
    modelIds: string[];
    messages: { role: string; content: string }[];
  };

  if (!sessionId || !turnId || !modelIds?.length || !messages?.length) {
    console.warn("[stream] bad request", { sessionId, turnId, modelCount: modelIds?.length });
    return new Response("Bad Request", { status: 400 });
  }

  const slotLabels = ["A", "B", "C", "D", "E", "F", "G", "H"];

  // ── Create response rows before the stream opens (single bulk insert) ────
  const supabase = createEdgeServiceClient();
  const responseIds: Record<string, string> = {};
  {
    const { data: insertedRows, error: bulkErr } = await supabase
      .from("responses")
      .insert(modelIds.map(modelId => ({ turn_id: turnId, model_id: modelId, content: "" })))
      .select("id, model_id");
    if (bulkErr) {
      console.error(`[stream:${turnId}]`, "bulk response insert failed", {
        code: bulkErr.code,
        detail: bulkErr.message,
      });
    }
    insertedRows?.forEach(row => { responseIds[row.model_id] = row.id; });
  }

  // ── Stream ────────────────────────────────────────────────────────────────
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode("data: " + JSON.stringify(data) + "\n\n"));
      };

      const updateDb = createEdgeServiceClient();

      const starts: Record<string, number> = {};
      modelIds.forEach(id => (starts[id] = Date.now()));

      console.log(`[stream:${turnId}]`, "starting", { models: modelIds, sessionId });

      await Promise.all(modelIds.map(async (modelId, idx) => {
        const slotLabel = slotLabels[idx];
        const t = tag(turnId, slotLabel);
        const fullContent: string[] = [];

        const abort = new AbortController();
        const timer = setTimeout(() => abort.abort(), MODEL_TIMEOUT_MS);

        try {
          // Retry loop — retries on 429 / 503 before surfacing error to client.
          let resp: Response | null = null;
          for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            if (abort.signal.aborted) break;

            resp = await fetch(OPENROUTER_BASE, {
              method: "POST",
              signal: abort.signal,
              headers: {
                Authorization: "Bearer " + getOpenRouterKey(),
                "Content-Type": "application/json",
                "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
                "X-Title": "Fleet Arena",
              },
              body: JSON.stringify({
                model: modelId,
                messages,
                stream: true,
                max_tokens: 1024,
              }),
            });

            const retryable = resp.status === 429 || resp.status === 503;
            if (!retryable || attempt === MAX_RETRIES) break;

            // Parse Retry-After if present, fall back to exponential backoff.
            const retryAfterHeader = resp.headers.get("Retry-After");
            const backoffMs = retryAfterHeader
              ? Math.min(parseFloat(retryAfterHeader) * 1000, RETRY_CAP_MS)
              : Math.min(1000 * 2 ** attempt, RETRY_CAP_MS);

            console.warn(t, `OpenRouter ${resp.status} — retry ${attempt + 1}/${MAX_RETRIES} in ${backoffMs}ms`, { model: modelId });
            // Consume and discard the error body so the connection is released.
            await resp.text().catch(() => {});
            await new Promise(res => setTimeout(res, backoffMs));
          }

          if (!resp || !resp.ok || !resp.body) {
            const errMsg = resp ? await readOpenRouterError(resp) : "No response from OpenRouter";
            console.error(t, "OpenRouter error", { model: modelId, error: errMsg });
            send({ type: "error", slotLabel, error: errMsg });
            return;
          }

          const reader = resp.body.getReader();
          const decoder = new TextDecoder();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split("\n").filter(l => l.startsWith("data: "));

            for (const line of lines) {
              const raw = line.slice(6);
              if (raw === "[DONE]") continue;
              try {
                const parsed = JSON.parse(raw);
                const delta = parsed.choices?.[0]?.delta?.content ?? "";
                if (delta) {
                  fullContent.push(delta);
                  send({ type: "delta", slotLabel, delta });
                }
                const finishReason = parsed.choices?.[0]?.finish_reason;
                if (finishReason) {
                  const content = fullContent.join("");
                  const latency = Date.now() - starts[modelId];
                  const responseId = responseIds[modelId];
                  if (responseId) {
                    const { error: updateErr } = await updateDb.from("responses").update({
                      content,
                      latency_ms: latency,
                      finish_reason: finishReason,
                      token_count: Math.round(content.length / 4),
                    }).eq("id", responseId);
                    if (updateErr) {
                      console.error(t, "response update failed", {
                        responseId,
                        code: updateErr.code,
                        detail: updateErr.message,
                      });
                    }
                  }
                  console.log(t, "done", { model: modelId, latency, chars: fullContent.join("").length, finishReason });
                  send({ type: "done", slotLabel, responseId, finishReason });
                }
              } catch (parseErr) {
                // Malformed SSE line from OpenRouter — log once per line so we can spot patterns
                console.warn(t, "malformed SSE line", { raw: raw.slice(0, 120), err: String(parseErr) });
              }
            }
          }
        } catch (err) {
          const isTimeout = (err as Error)?.name === "AbortError";
          const msg = friendlyError(err);
          if (isTimeout) {
            console.warn(t, "model timed out", { model: modelId, limitMs: MODEL_TIMEOUT_MS });
          } else {
            console.error(t, "unexpected error", { model: modelId, err: String(err) });
          }
          send({ type: "error", slotLabel, error: msg });
        } finally {
          clearTimeout(timer);
        }
      }));

      console.log(`[stream:${turnId}]`, "complete", { responseIds });
      send({ type: "complete", responseIds });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
