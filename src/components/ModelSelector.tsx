"use client";

import { MODELS } from "@/lib/models";

export default function ModelSelector({
  selected, onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((m) => m !== id));
    } else if (selected.length < 3) {
      onChange([...selected, id]);
    }
  };

  return (
    <div>
      <div style={{ fontSize: 11, letterSpacing: "1.2px", color: "var(--muted)", fontWeight: 600, marginBottom: 10 }}>
        SELECT 2–3 MODELS
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {MODELS.map((m) => {
          const active = selected.includes(m.id);
          return (
            <button
              key={m.id}
              onClick={() => toggle(m.id)}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "8px 14px", borderRadius: 20,
                border: `1px solid ${active ? m.color + "60" : "var(--border)"}`,
                background: active ? m.color + "14" : "transparent",
                color: active ? "var(--text)" : "var(--muted)",
                cursor: "pointer", fontSize: 13, fontWeight: 500,
                fontFamily: "inherit", transition: "all 0.12s",
              }}
            >
              <span style={{
                width: 7, height: 7, borderRadius: "50%",
                background: active ? m.color : "var(--muted)",
                flexShrink: 0,
              }} />
              {m.label}
              <span style={{ fontSize: 10, color: active ? "var(--muted)" : "transparent" }}>
                {m.provider}
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 12, fontSize: 12, color: "var(--muted)" }}>
        {selected.length}/3 selected
        {selected.length === 3 && " — deselect one to swap"}
      </div>
    </div>
  );
}
