"use client";

import { useState, useRef, useCallback } from "react";
import { Send, RotateCcw } from "lucide-react";
import { MODELS, getModel } from "@/lib/models";
import type { Turn, ResponseCard, Session } from "@/types";
import ResponseCardComponent from "@/components/ResponseCard";
import RankingBar from "@/components/RankingBar";
import ModelSelector from "@/components/ModelSelector";

export default function ArenaClient() {
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([
    "anthropic/claude-opus-4-5",
    "openai/gpt-4o",
  ]);
  const [session, setSession] = useState<Session | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [activeTurnIdx, setActiveTurnIdx] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<"config" | "session">("config");

  const textRef = useRef<HTMLTextAreaElement>(null);

  // ── Start session ──────────────────────────────────────────────────────────
  const startSession = useCallback(async () => {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelIds: selectedModelIds }),
    });
    const { sessionId } = await res.json();
    setSession({ id: sessionId, modelIds: selectedModelIds, turns: [], isComplete: false });
    setTurns([]);
    setPhase("session");
    setTimeout(() => textRef.current?.focus(), 50);
  }, [selectedModelIds]);

  // ── Submit prompt ──────────────────────────────────────────────────────────
  const submitPrompt = useCallback(async () => {
    if (!prompt.trim() || !session || loading) return;

    // Block new turn if previous turn is not ranked (and it's not the first turn)
    const prevTurn = turns[turns.length - 1];
    if (prevTurn && !prevTurn.rankingSubmitted) return;

    setLoading(true);
    const turnNumber = turns.length + 1;
    const currentPrompt = prompt.trim();
    setPrompt("");

    // 1. Create turn in DB
    const turnRes = await fetch("/api/sessions/turns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id, turnNumber, prompt: currentPrompt }),
    });
    const { turnId } = await turnRes.json();

    // 2. Init turn state with streaming placeholders
    const slotLabels = ["A", "B", "C"];
    const initResponses: ResponseCard[] = session.modelIds.map((_, i) => ({
      id: "",
      slotLabel: slotLabels[i],
      content: "",
      streaming: true,
    }));

    const newTurn: Turn = {
      id: turnId,
      turnNumber,
      prompt: currentPrompt,
      responses: initResponses,
      rankings: {},
      rankingSubmitted: false,
    };

    setTurns((prev) => {
      const updated = [...prev, newTurn];
      setActiveTurnIdx(updated.length - 1);
      return updated;
    });

    // 3. Build message history for context (prior turns)
    const messages: { role: string; content: string }[] = [];
    turns.forEach((t) => {
      messages.push({ role: "user", content: t.prompt });
      // Use slot A's response as the "assistant" context for multi-turn
      // (all models see same conversation context)
      const slotA = t.responses.find((r) => r.slotLabel === "A");
      if (slotA?.content) messages.push({ role: "assistant", content: slotA.content });
    });
    messages.push({ role: "user", content: currentPrompt });

    // 4. Stream from OpenRouter
    const streamRes = await fetch("/api/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id, turnId, modelIds: session.modelIds, messages }),
    });

    const reader = streamRes.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const ev = JSON.parse(line.slice(6));

          if (ev.type === "delta") {
            setTurns((prev) => prev.map((t, i) =>
              i === activeTurnIdx || t.id === turnId
                ? {
                    ...t,
                    responses: t.responses.map((r) =>
                      r.slotLabel === ev.slotLabel ? { ...r, content: r.content + ev.delta } : r
                    ),
                  }
                : t
            ));
          }

          if (ev.type === "done") {
            setTurns((prev) => prev.map((t) =>
              t.id === turnId
                ? {
                    ...t,
                    responses: t.responses.map((r) =>
                      r.slotLabel === ev.slotLabel
                        ? { ...r, id: ev.responseId, streaming: false, finishReason: ev.finishReason }
                        : r
                    ),
                  }
                : t
            ));
          }
        } catch {}
      }
    }

    setLoading(false);
  }, [prompt, session, loading, turns, activeTurnIdx]);

  // ── Submit ranking ─────────────────────────────────────────────────────────
  const submitRanking = useCallback(async (turnId: string, rankings: Record<string, number>) => {
    const turn = turns.find((t) => t.id === turnId);
    if (!turn || !session) return;

    const payload = Object.entries(rankings).map(([responseId, rank]) => ({ responseId, rank }));

    const res = await fetch("/api/rankings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id, turnId, rankings: payload }),
    });
    const { revealed } = await res.json() as { revealed: { id: string; model_id: string }[] };

    // Reveal model identities
    setTurns((prev) => prev.map((t) =>
      t.id === turnId
        ? {
            ...t,
            rankings,
            rankingSubmitted: true,
            responses: t.responses.map((r) => {
              const rev = revealed.find((x) => x.id === r.id);
              if (!rev) return r;
              return { ...r, modelId: rev.model_id, model: getModel(rev.model_id) };
            }),
          }
        : t
    ));
  }, [turns, session]);

  // ── Reset ──────────────────────────────────────────────────────────────────
  const reset = useCallback(async () => {
    if (session) {
      await fetch("/api/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id }),
      });
    }
    setSession(null);
    setTurns([]);
    setPhase("config");
    setPrompt("");
  }, [session]);

  const activeTurn = turns[activeTurnIdx];
  const lastTurn = turns[turns.length - 1];
  const canSubmit = !loading && prompt.trim().length > 0 && (!lastTurn || lastTurn.rankingSubmitted);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Topbar */}
      <div style={{
        height: 54, borderBottom: "1px solid var(--border)",
        display: "flex", alignItems: "center", padding: "0 24px",
        background: "var(--surface)", gap: 12, flexShrink: 0,
      }}>
        <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: "-0.3px" }}>Arena</span>
        {phase === "session" && (
          <>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>
              {turns.length} turn{turns.length !== 1 ? "s" : ""}
            </span>
            <button
              onClick={reset}
              style={{
                marginLeft: "auto", display: "flex", alignItems: "center", gap: 6,
                background: "transparent", border: "1px solid var(--border)",
                color: "var(--muted)", borderRadius: 8, padding: "6px 12px",
                cursor: "pointer", fontSize: 12, fontFamily: "inherit",
              }}
            >
              <RotateCcw size={13} /> New Session
            </button>
          </>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {phase === "config" ? (
          <ConfigScreen
            selectedModelIds={selectedModelIds}
            setSelectedModelIds={setSelectedModelIds}
            onStart={startSession}
          />
        ) : (
          <SessionScreen
            turns={turns}
            activeTurnIdx={activeTurnIdx}
            setActiveTurnIdx={setActiveTurnIdx}
            activeTurn={activeTurn}
            onSubmitRanking={submitRanking}
            session={session!}
          />
        )}
      </div>

      {/* Prompt bar (only in session) */}
      {phase === "session" && (
        <PromptBar
          prompt={prompt}
          setPrompt={setPrompt}
          onSubmit={submitPrompt}
          disabled={!canSubmit}
          blocked={!!lastTurn && !lastTurn.rankingSubmitted}
          textRef={textRef}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ConfigScreen({
  selectedModelIds, setSelectedModelIds, onStart,
}: {
  selectedModelIds: string[];
  setSelectedModelIds: (ids: string[]) => void;
  onStart: () => void;
}) {
  return (
    <div style={{
      flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
      padding: 40,
    }}>
      <div style={{ maxWidth: 560, width: "100%" }}>
        <div style={{ marginBottom: 8, fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px" }}>
          Pick your models
        </div>
        <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 32 }}>
          Select 2–3 models to compare. Identities are hidden until you rank each turn.
        </div>
        <ModelSelector selected={selectedModelIds} onChange={setSelectedModelIds} />
        <button
          onClick={onStart}
          disabled={selectedModelIds.length < 2}
          style={{
            marginTop: 28, width: "100%", padding: "13px",
            background: selectedModelIds.length < 2 ? "rgba(79,142,247,0.3)" : "var(--accent)",
            color: "#fff", border: "none", borderRadius: 10,
            fontSize: 14, fontWeight: 700, cursor: selectedModelIds.length < 2 ? "not-allowed" : "pointer",
            fontFamily: "inherit", transition: "background 0.15s",
          }}
        >
          Start Session →
        </button>
      </div>
    </div>
  );
}

function SessionScreen({
  turns, activeTurnIdx, setActiveTurnIdx, activeTurn, onSubmitRanking, session,
}: {
  turns: Turn[];
  activeTurnIdx: number;
  setActiveTurnIdx: (i: number) => void;
  activeTurn: Turn | undefined;
  onSubmitRanking: (turnId: string, rankings: Record<string, number>) => void;
  session: Session;
}) {
  const colClass = session.modelIds.length === 2
    ? "grid-cols-2"
    : "grid-cols-3";

  return (
    <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
      {/* Turn tabs */}
      {turns.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
          {turns.map((t, i) => (
            <button
              key={t.id}
              onClick={() => setActiveTurnIdx(i)}
              style={{
                padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                border: "1px solid",
                borderColor: activeTurnIdx === i ? "var(--accent)" : "var(--border)",
                background: activeTurnIdx === i ? "rgba(79,142,247,0.1)" : "transparent",
                color: activeTurnIdx === i ? "var(--accent)" : "var(--muted)",
                cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              Turn {i + 1}
              {t.rankingSubmitted && (
                <span style={{ fontSize: 10, color: "var(--success)" }}>✓</span>
              )}
            </button>
          ))}
        </div>
      )}

      {activeTurn ? (
        <>
          {/* Prompt */}
          <div style={{
            fontSize: 12, color: "var(--muted)", marginBottom: 16,
            fontFamily: "monospace", padding: "10px 14px",
            background: "rgba(255,255,255,0.02)", borderRadius: 8,
            borderLeft: "2px solid var(--border-bright)",
          }}>
            {activeTurn.prompt}
          </div>

          {/* Responses grid */}
          <div style={{
            display: "grid",
            gridTemplateColumns: session.modelIds.length === 2 ? "1fr 1fr" : "1fr 1fr 1fr",
            gap: 14,
            marginBottom: 16,
          }}>
            {activeTurn.responses.map((r) => (
              <ResponseCardComponent key={r.slotLabel} response={r} />
            ))}
          </div>

          {/* Ranking bar */}
          <RankingBar
            turn={activeTurn}
            onSubmit={(rankings) => onSubmitRanking(activeTurn.id, rankings)}
          />
        </>
      ) : (
        <div style={{ textAlign: "center", padding: "80px 20px", color: "var(--muted)" }}>
          Type a prompt below to begin.
        </div>
      )}
    </div>
  );
}

function PromptBar({
  prompt, setPrompt, onSubmit, disabled, blocked, textRef,
}: {
  prompt: string;
  setPrompt: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  blocked: boolean;
  textRef: React.RefObject<HTMLTextAreaElement>;
}) {
  return (
    <div style={{
      borderTop: "1px solid var(--border)", background: "var(--surface)",
      padding: "14px 24px",
    }}>
      {blocked && (
        <div style={{
          marginBottom: 10, fontSize: 12, color: "var(--warn)",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          ⚠ Rank the responses above before continuing — or skip by pressing ↓
          <button
            onClick={() => {/* allow without ranking — just flag skip */}}
            style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 11, fontFamily: "inherit", textDecoration: "underline" }}
          >
            skip ranking
          </button>
        </div>
      )}
      <div style={{
        display: "flex", gap: 10, alignItems: "flex-end",
        background: "var(--surface2)", border: "1px solid var(--border-bright)",
        borderRadius: 10, padding: "10px 14px",
      }}>
        <textarea
          ref={textRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); } }}
          placeholder={blocked ? "Rank the responses above to continue…" : "Ask anything…"}
          rows={1}
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            color: "var(--text)", fontFamily: "inherit", fontSize: 14,
            resize: "none", lineHeight: 1.5, maxHeight: 120,
          }}
        />
        <button
          onClick={onSubmit}
          disabled={disabled}
          style={{
            background: disabled ? "rgba(79,142,247,0.25)" : "var(--accent)",
            color: disabled ? "rgba(255,255,255,0.4)" : "#fff",
            border: "none", borderRadius: 8, padding: "8px 10px",
            cursor: disabled ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", transition: "background 0.15s",
          }}
        >
          <Send size={15} />
        </button>
      </div>
    </div>
  );
}
