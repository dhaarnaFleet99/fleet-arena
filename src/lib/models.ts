import type { Model } from "@/types";

export const MODELS: Model[] = [
  { id: "anthropic/claude-opus-4-5",                  label: "Claude Opus",     provider: "Anthropic", color: "#C084FC", contextWindow: "200k" },
  { id: "anthropic/claude-sonnet-4-5",                label: "Claude Sonnet",   provider: "Anthropic", color: "#A78BFA", contextWindow: "200k" },
  { id: "openai/gpt-4o",                              label: "GPT-4o",          provider: "OpenAI",    color: "#34D399", contextWindow: "128k" },
  { id: "openai/gpt-4o-mini",                         label: "GPT-4o Mini",     provider: "OpenAI",    color: "#6EE7B7", contextWindow: "128k" },
  { id: "google/gemini-pro-1.5",                      label: "Gemini 1.5 Pro",  provider: "Google",    color: "#60A5FA", contextWindow: "1M"   },
  { id: "meta-llama/llama-3.1-405b-instruct",         label: "Llama 405B",      provider: "Meta",      color: "#FB923C", contextWindow: "128k" },
  { id: "mistralai/mistral-large",                    label: "Mistral Large",   provider: "Mistral",   color: "#F472B6", contextWindow: "32k"  },
  { id: "x-ai/grok-beta",                             label: "Grok Beta",       provider: "xAI",       color: "#FBBF24", contextWindow: "131k" },
];

export const getModel = (id: string) => MODELS.find((m) => m.id === id);
