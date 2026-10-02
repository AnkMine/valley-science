/** Compatibility re-export — Valerie lives in llm.ts (local / OpenRouter / Gemini). */
export {
  getSystemInstruction,
  SYSTEM_INSTRUCTION,
  getSocraticResponse,
  resolveAiProvider,
  describeActiveAi,
  type ChatTurn,
  type AiProvider,
} from "./llm.js";