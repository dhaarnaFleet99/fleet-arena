import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { analyzeSessionFn } from "@/inngest/analyzeSession";

// Inngest calls this endpoint to trigger and resume step functions.
// maxDuration must cover the longest step — the judge LLM call (~90 s).
export const maxDuration = 120;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [analyzeSessionFn],
});
