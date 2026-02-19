"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Send, RotateCcw, LogIn } from "lucide-react";
import { MODELS, getModel } from "@/lib/models";
import type { Turn, ResponseCard, Session } from "@/types";
import ResponseCardComponent from "@/components/ResponseCard";
import RankingBar from "@/components/RankingBar";
import ModelSelector from "@/components/ModelSelector";
import Link from "next/link";

const STORAGE_KEY = "arena_active_session";
const SLOTS = ["A", "B", "C", "D", "E", "F", "G", "H"];

function buildTurnsFromDB(
  dbTurns: any[], responses: any[], rankings: any[], modelIds: string[]
): Turn[] {
  return dbTurns
    .sort((a: any, b: any) => a.turn_number - b.turn_number)
    .map((turn: any) => {
      const turnResponses = responses.filter((r: any) => r.turn_id === turn.id);
      const turnRankings = rankings.filter((rk: any) => rk.turn_id === turn.id);
      const responseCards: ResponseCard[] = turnResponses
        .map((r: any) => {
          const slotLabel = SLOTS[modelIds.indexOf(r.model_id)] ?? "?";
          return {
            id: r.id, slotLabel, content: r.content ?? "", streaming: false,
            finishReason: r.finish_reason,
            ...(turn.ranking_submitted ? { modelId: r.model_id, model: getModel(r.model_id) } : {}),
          };
        })
        .sort((a: any, b: any) => SLOTS.indexOf(a.slotLabel) - SLOTS.indexOf(b.slotLabel));
      const rankingMap: Record<string, number> = {};
      for (const rk of turnRankings) {
        const resp = turnResponses.find((r: any) => r.id === rk.response_id);
        if (resp) { const sl = SLOTS[modelIds.indexOf(resp.model_id)]; if (sl) rankingMap[sl] = rk.rank; }
      }
      return { id: turn.id, turnNumber: turn.turn_number, prompt: turn.prompt, responses: responseCards, rankings: rankingMap, rankingSubmitted: turn.ranking_submitted ?? false, rankingSkipped: false };
    });
}

type Props = { userId: string | null };

export default function ArenaClient({ userId }: Props) {
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([
    "anthropic/claude-sonnet-4.6",
    "openai/gpt-4.1",
  ]);
  const [session, setSession] = useState<Session | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [activeTurnIdx, setActiveTurnIdx] = useState(0);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<"config" | "session">("config");
  const [resuming, setResuming] = useState(true);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // ── Restore session from localStorage on mount ─────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) { setResuming(false); return; }
    try {
      const { sessionId, modelIds } = JSON.parse(saved) as { sessionId: string; modelIds: string[] };
      fetch(`/api/sessions/resume?sessionId=${sessionId}`)
        .then(r => r.json())
        .then(({ session: s, turns: dbTurns, responses, rankings }) => {
          if (!s || s.is_complete) { localStorage.removeItem(STORAGE_KEY); return; }
          const rebuilt = buildTurnsFromDB(dbTurns ?? [], responses ?? [], rankings ?? [], modelIds);
          setSession({ id: s.id, modelIds, turns: [], isComplete: false });
          setSelectedModelIds(modelIds);
          setTurns(rebuilt);
          setActiveTurnIdx(Math.max(0, rebuilt.length - 1));
          setPhase("session");
        })
        .catch(() => localStorage.removeItem(STORAGE_KEY))
        .finally(() => setResuming(false));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      setResuming(false);
    }
  }, []);

  // ── Send beacon on tab/window close to mark session complete ───────────────
  useEffect(() => {
    if (!session) return;
    const onUnload = () => {
      navigator.sendBeacon("/api/sessions/complete", new Blob([JSON.stringify({ sessionId: session.id })], { type: "application/json" }));
      localStorage.removeItem(STORAGE_KEY);
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [session]);

  // ── Start session ──────────────────────────────────────────────────────────
  const startSession = useCallback(async () => {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelIds: selectedModelIds }),
    });
    const { sessionId, error } = await res.json();
    if (error) { alert("Error creating session: " + error); return; }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId, modelIds: selectedModelIds }));
    setSession({ id: sessionId, modelIds: selectedModelIds, turns: [], isComplete: false });
    setTurns([]);
    setPhase("session");
    setTimeout(() => textRef.current?.focus(), 50);
  }, [selectedModelIds]);

  // ── Build conversation history for multi-turn context ──────────────────────
  // Each model in each slot gets the SAME conversation history.
  // For prior turns, we use the #1 ranked response as the canonical assistant reply.
  // If no ranking, we use slot A.
  const buildMessages = useCallback((currentPrompt: string, priorTurns: Turn[]) => {
    const messages: { role: string; content: string }[] = [];
    for (const t of priorTurns) {
      messages.push({ role: "user", content: t.prompt });
      // Best response = lowest rank number (rankings keyed by slotLabel), fallback to slot A
      const ranked = [...t.responses]
        .filter(r => !r.streaming)
        .sort((a, b) => {
          const ra = t.rankings[a.slotLabel] ?? 999;
          const rb = t.rankings[b.slotLabel] ?? 999;
          return ra - rb;
        });
      const best = ranked[0] ?? t.responses.find(r => r.slotLabel === "A");
      if (best?.content) {
        messages.push({ role: "assistant", content: best.content });
      }
    }
    messages.push({ role: "user", content: currentPrompt });
    return messages;
  }, []);

  // ── Submit prompt ──────────────────────────────────────────────────────────
  const submitPrompt = useCallback(async () => {
    if (!prompt.trim() || !session || loading) return;
    const prevTurn = turns[turns.length - 1];
    // Block if prev turn exists and has no ranking submitted AND user hasn't explicitly skipped
    if (prevTurn && !prevTurn.rankingSubmitted && !prevTurn.rankingSkipped) return;

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

    // 2. Init placeholder state
    const initResponses: ResponseCard[] = session.modelIds.map((_, i) => ({
      id: "",
      slotLabel: SLOTS[i],
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
      rankingSkipped: false,
    };

    const newTurns = [...turns, newTurn];
    setTurns(newTurns);
    setActiveTurnIdx(newTurns.length - 1);

    // 3. Build full conversation history
    const messages = buildMessages(currentPrompt, turns);

    // 4. Stream
    const streamRes = await fetch("/api/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id, turnId, modelIds: session.modelIds, messages }),
    });

    if (!streamRes.ok || !streamRes.body) { setLoading(false); return; }

    const reader = streamRes.body.getReader();
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
            setTurns(prev => prev.map(t =>
              t.id === turnId
                ? { ...t, responses: t.responses.map(r =>
                    r.slotLabel === ev.slotLabel ? { ...r, content: r.content + ev.delta } : r
                  )}
                : t
            ));
          }
          if (ev.type === "done") {
            setTurns(prev => prev.map(t =>
              t.id === turnId
                ? { ...t, responses: t.responses.map(r =>
                    r.slotLabel === ev.slotLabel
                      ? { ...r, id: ev.responseId, streaming: false, finishReason: ev.finishReason }
                      : r
                  )}
                : t
            ));
          }
          if (ev.type === "error") {
            // Keep id:"" so the ranking bar excludes this response (avoids id collision)
            setTurns(prev => prev.map(t =>
              t.id === turnId
                ? { ...t, responses: t.responses.map(r =>
                    r.slotLabel === ev.slotLabel
                      ? { ...r, streaming: false, content: r.content || "[Error: model unavailable]" }
                      : r
                  )}
                : t
            ));
          }
        } catch {}
      }
    }

    // Force-finish any responses still streaming after stream closes (keep id:"" so they're excluded from ranking)
    setTurns(prev => prev.map(t =>
      t.id === turnId
        ? { ...t, responses: t.responses.map(r =>
            r.streaming ? { ...r, streaming: false } : r
          )}
        : t
    ));
    setLoading(false);
  }, [prompt, session, loading, turns, buildMessages]);

  // ── Submit ranking ─────────────────────────────────────────────────────────
  // `rankings` is keyed by slotLabel ("A"/"B"/"C") from RankingBar
  // The API resolves slotLabel → response_id server-side (reliable, non-edge)
  const submitRanking = useCallback(async (turnId: string, rankings: Record<string, number>) => {
    if (!session) return;

    const payload = Object.entries(rankings).map(([slotLabel, rank]) => ({ slotLabel, rank }));

    let revealed: { id: string; model_id: string; slot_label: string }[] = [];
    try {
      const res = await fetch("/api/rankings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: session.id, turnId, rankings: payload }),
      });
      const data = await res.json() as { revealed?: typeof revealed };
      revealed = data.revealed ?? [];
    } catch {}

    // Fallback reveal: use session model order (Slot A = modelIds[0], etc.)
    const slotLabels = ["A", "B", "C"];
    const fallbackRevealed = session.modelIds.map((modelId, i) => ({
      id: "", model_id: modelId, slot_label: slotLabels[i],
    }));
    const finalRevealed = revealed.length > 0 ? revealed : fallbackRevealed;

    setTurns(prev => prev.map(t =>
      t.id === turnId
        ? {
            ...t, rankings, rankingSubmitted: true,
            responses: t.responses.map(r => {
              // Match by slot_label (robust even when r.id is missing)
              const rev = finalRevealed.find(x => x.slot_label === r.slotLabel);
              if (!rev) return r;
              return { ...r, modelId: rev.model_id, model: getModel(rev.model_id) };
            }),
          }
        : t
    ));
  }, [session, turns]);

  // ── Skip ranking ───────────────────────────────────────────────────────────
  const skipRanking = useCallback((turnId: string) => {
    setTurns(prev => prev.map(t =>
      t.id === turnId ? { ...t, rankingSkipped: true } : t
    ));
  }, []);

  // ── End session ────────────────────────────────────────────────────────────
  const endSession = useCallback(async () => {
    if (!session) return;
    localStorage.removeItem(STORAGE_KEY);
    await fetch("/api/sessions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id }),
    });
    setSession(null);
    setTurns([]);
    setPhase("config");
    setPrompt("");
  }, [session]);

  const lastTurn = turns[turns.length - 1];
  const canSubmit = !loading && prompt.trim().length > 0 &&
    (!lastTurn || lastTurn.rankingSubmitted || lastTurn.rankingSkipped);
  const blocked = !!lastTurn && !lastTurn.rankingSubmitted && !lastTurn.rankingSkipped;

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
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button onClick={endSession} style={ghostBtn}>
                <RotateCcw size={13} /> End Session
              </button>
            </div>
          </>
        )}
        {!userId && phase === "config" && (
          <Link href="/login" style={{ marginLeft: "auto", textDecoration: "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>
              <LogIn size={13} /> Sign in to save sessions
            </div>
          </Link>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {resuming ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 13 }}>
            Resuming session…
          </div>
        ) : phase === "config" ? (
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
            session={session!}
            onSubmitRanking={submitRanking}
            onSkipRanking={skipRanking}
          />
        )}
      </div>

      {/* Prompt bar */}
      {phase === "session" && (
        <PromptBar
          prompt={prompt}
          setPrompt={setPrompt}
          onSubmit={submitPrompt}
          disabled={!canSubmit}
          blocked={blocked}
          onSkip={() => lastTurn && skipRanking(lastTurn.id)}
          textRef={textRef}
          loading={loading}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ConfigScreen({ selectedModelIds, setSelectedModelIds, onStart }: {
  selectedModelIds: string[];
  setSelectedModelIds: (ids: string[]) => void;
  onStart: () => void;
}) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
      <div style={{ maxWidth: 560, width: "100%" }}>
        <div style={{ marginBottom: 6, fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px" }}>
          Pick your models
        </div>
        <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 32 }}>
          Select 2–3 models. Identities stay hidden until you rank each turn.
        </div>
        <ModelSelector selected={selectedModelIds} onChange={setSelectedModelIds} />
        <button onClick={onStart} disabled={selectedModelIds.length < 2} style={{
          marginTop: 28, width: "100%", padding: "13px",
          background: selectedModelIds.length < 2 ? "rgba(79,142,247,0.25)" : "var(--accent)",
          color: selectedModelIds.length < 2 ? "rgba(255,255,255,0.3)" : "#fff",
          border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700,
          cursor: selectedModelIds.length < 2 ? "not-allowed" : "pointer",
          fontFamily: "inherit",
        }}>
          Start Session →
        </button>
      </div>
    </div>
  );
}

function SessionScreen({ turns, activeTurnIdx, setActiveTurnIdx, session, onSubmitRanking, onSkipRanking }: {
  turns: Turn[];
  activeTurnIdx: number;
  setActiveTurnIdx: (i: number) => void;
  session: Session;
  onSubmitRanking: (turnId: string, rankings: Record<string, number>) => void;
  onSkipRanking: (turnId: string) => void;
}) {
  const activeTurn = turns[activeTurnIdx];

  return (
    <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
      {/* Turn tabs */}
      {turns.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
          {turns.map((t, i) => (
            <button key={t.id} onClick={() => setActiveTurnIdx(i)} style={{
              padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
              border: "1px solid",
              borderColor: activeTurnIdx === i ? "var(--accent)" : "var(--border)",
              background: activeTurnIdx === i ? "rgba(79,142,247,0.1)" : "transparent",
              color: activeTurnIdx === i ? "var(--accent)" : "var(--muted)",
              cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              Turn {i + 1}
              {t.rankingSubmitted && <span style={{ fontSize: 10, color: "var(--success)" }}>✓</span>}
              {t.rankingSkipped && <span style={{ fontSize: 10, color: "var(--muted)" }}>–</span>}
            </button>
          ))}
        </div>
      )}

      {activeTurn ? (
        <>
          <div style={{
            fontSize: 12, color: "var(--muted)", marginBottom: 16,
            fontFamily: "monospace", padding: "10px 14px",
            background: "rgba(255,255,255,0.02)", borderRadius: 8,
            borderLeft: "2px solid var(--border-bright)",
          }}>
            {activeTurn.prompt}
          </div>

          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${session.modelIds.length <= 3 ? session.modelIds.length : session.modelIds.length <= 4 ? 2 : session.modelIds.length <= 6 ? 3 : 4}, 1fr)`,
            gap: 14, marginBottom: 16,
          }}>
            {activeTurn.responses.map(r => (
              <ResponseCardComponent key={r.slotLabel} response={r} />
            ))}
          </div>

          <RankingBar
            turn={activeTurn}
            onSubmit={rankings => onSubmitRanking(activeTurn.id, rankings)}
            onSkip={() => onSkipRanking(activeTurn.id)}
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

function PromptBar({ prompt, setPrompt, onSubmit, disabled, blocked, onSkip, textRef, loading }: {
  prompt: string;
  setPrompt: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  blocked: boolean;
  onSkip: () => void;
  textRef: React.RefObject<HTMLTextAreaElement>;
  loading: boolean;
}) {
  return (
    <div style={{ borderTop: "1px solid var(--border)", background: "var(--surface)", padding: "14px 24px" }}>
      {blocked && (
        <div style={{ marginBottom: 10, fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 8 }}>
          Rank the responses above to continue, or{" "}
          <button onClick={onSkip} style={{ background: "transparent", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 12, fontFamily: "inherit", textDecoration: "underline", padding: 0 }}>
            skip ranking
          </button>
        </div>
      )}
      <div style={{
        display: "flex", gap: 10, alignItems: "flex-end",
        background: "var(--surface2)", border: "1px solid var(--border-bright)",
        borderRadius: 10, padding: "10px 14px",
        opacity: blocked ? 0.6 : 1,
      }}>
        <textarea
          ref={textRef}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); } }}
          placeholder={blocked ? "Rank above to continue…" : "Ask anything… (Enter to send, Shift+Enter for newline)"}
          rows={1}
          style={{
            flex: 1, background: "transparent", border: "none", outline: "none",
            color: "var(--text)", fontFamily: "inherit", fontSize: 14,
            resize: "none", lineHeight: 1.5, maxHeight: 120,
          }}
        />
        <button onClick={onSubmit} disabled={disabled} style={{
          background: disabled ? "rgba(79,142,247,0.2)" : "var(--accent)",
          color: disabled ? "rgba(255,255,255,0.3)" : "#fff",
          border: "none", borderRadius: 8, padding: "8px 10px",
          cursor: disabled ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", transition: "background 0.15s",
        }}>
          {loading ? <span style={{ fontSize: 13 }}>…</span> : <Send size={15} />}
        </button>
      </div>
    </div>
  );
}

const ghostBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6,
  background: "transparent", border: "1px solid var(--border)",
  color: "var(--muted)", borderRadius: 8, padding: "6px 12px",
  cursor: "pointer", fontSize: 12, fontFamily: "inherit",
};
