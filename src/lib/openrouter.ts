// Supports comma-separated OPENROUTER_API_KEY for round-robin key rotation.
// Example: OPENROUTER_API_KEY=key1,key2,key3
const keys = (process.env.OPENROUTER_API_KEY ?? "")
  .split(",")
  .map(k => k.trim())
  .filter(Boolean);

let keyIdx = 0;

export function getOpenRouterKey(): string {
  if (keys.length === 0) throw new Error("OPENROUTER_API_KEY is not configured");
  const key = keys[keyIdx % keys.length];
  keyIdx = (keyIdx + 1) % keys.length;
  return key;
}

export const OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions";
