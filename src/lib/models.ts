import type { Model } from "@/types";

export const MODELS: Model[] = [
  // Anthropic
  { id: "anthropic/claude-opus-4.6",                  label: "Claude Opus 4.6",     provider: "Anthropic", color: "#C084FC", contextWindow: "1M"   },
  { id: "anthropic/claude-sonnet-4.6",                label: "Claude Sonnet 4.6",   provider: "Anthropic", color: "#A78BFA", contextWindow: "1M"   },
  { id: "anthropic/claude-haiku-4.5",                 label: "Claude Haiku 4.5",    provider: "Anthropic", color: "#818CF8", contextWindow: "200k" },
  // OpenAI
  { id: "openai/gpt-4.1",                             label: "GPT-4.1",             provider: "OpenAI",    color: "#34D399", contextWindow: "1M"   },
  { id: "openai/gpt-4o",                              label: "GPT-4o",              provider: "OpenAI",    color: "#6EE7B7", contextWindow: "128k" },
  { id: "openai/o3",                                  label: "o3",                  provider: "OpenAI",    color: "#4ADE80", contextWindow: "200k" },
  { id: "openai/o4-mini",                             label: "o4 Mini",             provider: "OpenAI",    color: "#86EFAC", contextWindow: "200k" },
  // Google
  { id: "google/gemini-2.5-pro",                      label: "Gemini 2.5 Pro",      provider: "Google",    color: "#60A5FA", contextWindow: "1M"   },
  { id: "google/gemini-2.5-flash",                    label: "Gemini 2.5 Flash",    provider: "Google",    color: "#93C5FD", contextWindow: "1M"   },
  // Meta
  { id: "meta-llama/llama-4-maverick",                label: "Llama 4 Maverick",    provider: "Meta",      color: "#FB923C", contextWindow: "1M"   },
  { id: "meta-llama/llama-4-scout",                   label: "Llama 4 Scout",       provider: "Meta",      color: "#FCA5A5", contextWindow: "327k" },
  // xAI
  { id: "x-ai/grok-4",                                label: "Grok 4",              provider: "xAI",       color: "#FBBF24", contextWindow: "256k" },
  { id: "x-ai/grok-3",                                label: "Grok 3",              provider: "xAI",       color: "#FDE68A", contextWindow: "131k" },
  // DeepSeek
  { id: "deepseek/deepseek-chat",                     label: "DeepSeek V3",         provider: "DeepSeek",  color: "#22D3EE", contextWindow: "163k" },
  { id: "deepseek/deepseek-r1-0528",                  label: "DeepSeek R1",         provider: "DeepSeek",  color: "#67E8F9", contextWindow: "163k" },
  // Mistral
  { id: "mistralai/mistral-large-2512",               label: "Mistral Large 3",     provider: "Mistral",   color: "#F472B6", contextWindow: "262k" },
];

export const getModel = (id: string) => MODELS.find((m) => m.id === id);
