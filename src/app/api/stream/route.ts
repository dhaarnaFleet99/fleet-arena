import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const { sessionId, turnId, modelIds, messages } = await req.json() as {
    sessionId: string;
    turnId: string;
    modelIds: string[];
    messages: { role: string; content: string }[];
  };

  if (!sessionId || !turnId || !modelIds?.length || !messages?.length) {
    return new Response("Bad Request", { status: 400 });
  }

  const slotLabels = ["A", "B", "C", "D", "E", "F", "G", "H"];

  // ── Create response rows BEFORE the stream starts ─────────────────────────
  // Must run in the normal route handler async context. @supabase/ssr can fail
  // silently when createServiceClient() is called inside a ReadableStream callback,
  // which would leave the responses table empty and break rankings.
  const supabase = createServiceClient();
  const responseIds: Record<string, string> = {};
  for (let i = 0; i < modelIds.length; i++) {
    const { data, error } = await supabase
      .from("responses")
      .insert({
        turn_id: turnId,
        model_id: modelIds[i],
        // slot_label and session_id omitted — columns missing from live DB schema.
        // Slot is derived at query-time from model order in session.model_ids.
        content: "",
      })
      .select("id")
      .single();
    if (error) {
      console.error("[stream] response insert failed:", error.message, { modelId: modelIds[i], turnId, sessionId });
    }
    if (data) responseIds[modelIds[i]] = data.id;
  }

  // ── Stream ────────────────────────────────────────────────────────────────
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode("data: " + JSON.stringify(data) + "\n\n"));
      };

      // Separate client instance for updates inside the stream
      const updateSupabase = createServiceClient();

      const starts: Record<string, number> = {};
      modelIds.forEach(id => (starts[id] = Date.now()));

      await Promise.all(modelIds.map(async (modelId, idx) => {
        const slotLabel = slotLabels[idx];
        const fullContent: string[] = [];

        try {
          const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: "Bearer " + process.env.OPENROUTER_API_KEY,
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

          if (!resp.ok || !resp.body) {
            send({ type: "error", slotLabel, error: "HTTP " + resp.status });
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
                    const { error: updateErr } = await updateSupabase.from("responses").update({
                      content,
                      latency_ms: latency,
                      finish_reason: finishReason,
                      token_count: Math.round(content.length / 4),
                    }).eq("id", responseId);
                    if (updateErr) {
                      console.error("[stream] response update failed:", updateErr.message, { responseId, modelId });
                    }
                  }
                  send({ type: "done", slotLabel, responseId, finishReason });
                }
              } catch {}
            }
          }
        } catch (err) {
          send({ type: "error", slotLabel, error: String(err) });
        }
      }));

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
