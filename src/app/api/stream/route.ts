import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getModel } from "@/lib/models";

export const runtime = "edge";

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

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Create a response row per model (without model_id yet — stays blind)
      const supabase = createServiceClient();
      const responseIds: Record<string, string> = {};
      const slotLabels = ["A", "B", "C"];

      for (let i = 0; i < modelIds.length; i++) {
        const { data } = await supabase
          .from("responses")
          .insert({ turn_id: turnId, model_id: modelIds[i], content: "" })
          .select("id")
          .single();
        if (data) responseIds[modelIds[i]] = data.id;
      }

      // Stream all models in parallel
      const starts: Record<string, number> = {};
      modelIds.forEach((id) => (starts[id] = Date.now()));

      const fetches = modelIds.map(async (modelId, idx) => {
        const slotLabel = slotLabels[idx];
        const fullContent: string[] = [];

        try {
          const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
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
            send({ type: "error", slotLabel, modelId, error: `HTTP ${resp.status}` });
            return;
          }

          const reader = resp.body.getReader();
          const decoder = new TextDecoder();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

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
                  // Update DB row
                  await supabase
                    .from("responses")
                    .update({ content, latency_ms: latency, finish_reason: finishReason, token_count: content.length / 4 | 0 })
                    .eq("id", responseIds[modelId]);
                  send({ type: "done", slotLabel, responseId: responseIds[modelId], finishReason });
                }
              } catch {}
            }
          }
        } catch (err) {
          send({ type: "error", slotLabel, modelId, error: String(err) });
        }
      });

      await Promise.all(fetches);
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
