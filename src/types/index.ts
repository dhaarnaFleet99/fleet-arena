export type Model = {
  id: string;
  label: string;
  provider: string;
  color: string;
  contextWindow: string;
};

export type Turn = {
  id: string;
  turnNumber: number;
  prompt: string;
  responses: ResponseCard[];
  rankings: Record<string, number>;   // responseId -> rank
  rankingSubmitted: boolean;
  rankingSkipped: boolean;
};

export type ResponseCard = {
  id: string;
  slotLabel: string;                  // "A" | "B" | "C" — shown blind until ranked
  content: string;
  streaming: boolean;
  modelId?: string;                   // revealed after ranking
  model?: Model;
  latencyMs?: number;
  finishReason?: string;
};

export type Session = {
  id: string;
  modelIds: string[];
  turns: Turn[];
  isComplete: boolean;
};

export type BehavioralFlag = {
  id: string;
  sessionId: string;
  turnId?: string;
  modelId: string;
  flagType: "refusal" | "context_loss" | "sycophancy" | "verbosity" | "rank_reversal";
  severity: "low" | "medium" | "high";
  description: string;
  evidence: Record<string, unknown>;
  confidence: number;
};
