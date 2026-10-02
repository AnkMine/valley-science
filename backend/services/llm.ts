import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import { retrieveGrade3Context } from "./rag.js";

export type ChatTurn = { role: "user" | "model"; text: string };

export type AiProvider = "local" | "openrouter" | "gemini" | "auto";

/** Dynamically locates and reads system_prompt.txt from backend/ on every call */
export function getSystemInstruction(): string {
  const candidates: string[] = [];

  // 1. Path relative to backend/services/llm.ts -> backend/system_prompt.txt
  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    candidates.push(path.resolve(currentDir, "../system_prompt.txt"));
  } catch {
    if (typeof __dirname !== "undefined") {
      candidates.push(path.resolve(__dirname, "../system_prompt.txt"));
    }
  }

  // 2. Paths based on current working directory
  candidates.push(path.join(process.cwd(), "backend", "system_prompt.txt"));
  candidates.push(path.join(process.cwd(), "system_prompt.txt"));

  for (const promptPath of candidates) {
    if (fs.existsSync(promptPath)) {
      try {
        return fs.readFileSync(promptPath, "utf-8");
      } catch (e) {
        console.error(`Failed to read prompt at ${promptPath}`, e);
      }
    }
  }

  console.warn("Could not find system_prompt.txt in expected paths, using fallback.");
  return "You are Valerie, a Socratic science tutor.";
}

/** Compatibility export for legacy callers / re-exports (e.g., gemini.ts) */
export const SYSTEM_INSTRUCTION = getSystemInstruction();

export function resolveAiProvider(env: NodeJS.ProcessEnv = process.env): AiProvider {
  const raw = (env.AI_PROVIDER || "auto").trim().toLowerCase();
  if (raw === "local" || raw === "openrouter" || raw === "gemini" || raw === "auto") {
    return raw;
  }
  return "auto";
}

export function describeActiveAi(env: NodeJS.ProcessEnv = process.env): string {
  const provider = resolveAiProvider(env);
  if (provider === "local" || (provider === "auto" && env.LOCAL_LLM_BASE_URL?.trim())) {
    const model = env.LOCAL_LLM_MODEL?.trim() || "phi-4-mini-instruct";
    const base = env.LOCAL_LLM_BASE_URL?.trim() || "http://127.0.0.1:1234/v1";
    return `local (${model} @ ${base})`;
  }
  if (provider === "openrouter" || (provider === "auto" && env.OPENROUTER_API_KEY?.trim())) {
    return "openrouter";
  }
  if (env.GEMINI_API_KEY?.trim()) return "gemini";
  return "none";
}

function buildSystemPrompt(
  moduleContext?: string,
  studentContext?: string,
  retrievedContext?: string
): string {
  let prompt = getSystemInstruction();
  if (studentContext) prompt += `\n\nSTUDENT LEARNING CONTEXT:\n${studentContext}`;
  if (moduleContext) prompt += `\n\nCURRENT MODULE CONTEXT:\n${moduleContext}`;
  if (retrievedContext) {
    prompt += `\n\nRETRIEVED_GRADE3_CONTEXT (trusted curriculum snippets — prefer these facts):\n${retrievedContext}`;
  }
  return prompt;
}

type OpenAiChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

const DEFAULT_LOCAL_LLM_TIMEOUT_MS = 120_000;

function localLlmTimeoutMs(): number {
  const raw = Number(process.env.LOCAL_LLM_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return DEFAULT_LOCAL_LLM_TIMEOUT_MS;
}

function startTimeoutSignal(ms: number): { signal: AbortSignal; stop: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`Local LLM timed out after ${ms}ms`));
  }, ms);
  timer.unref();
  return {
    signal: controller.signal,
    stop: () => clearTimeout(timer),
  };
}

async function callOpenAiCompatible(options: {
  baseUrl: string;
  model: string;
  apiKey?: string;
  systemPrompt: string;
  messages: ChatTurn[];
  signal?: AbortSignal;
}): Promise<string | null> {
  const base = options.baseUrl.replace(/\/$/, "");
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: options.model,
      messages: [
        { role: "system", content: options.systemPrompt },
        ...options.messages.map((m) => ({
          role: m.role === "model" ? "assistant" : "user",
          content: m.text,
        })),
      ],
      temperature: 0.7,
    }),
    signal: options.signal,
  });

  const data = (await response.json()) as OpenAiChatResponse;
  if (!response.ok) {
    console.error("OpenAI-compatible LLM error:", response.status, data.error?.message || data);
    return null;
  }
  return data.choices?.[0]?.message?.content || null;
}

async function callLocalLlm(systemPrompt: string, messages: ChatTurn[]): Promise<string | null> {
  const baseUrl = process.env.LOCAL_LLM_BASE_URL?.trim() || "http://127.0.0.1:1234/v1";
  const model = process.env.LOCAL_LLM_MODEL?.trim() || "phi-4-mini-instruct";
  const apiKey = process.env.LOCAL_LLM_API_KEY?.trim() || "lm-studio";
  const timeout = startTimeoutSignal(localLlmTimeoutMs());
  try {
    return await callOpenAiCompatible({
      baseUrl,
      model,
      apiKey,
      systemPrompt,
      messages,
      signal: timeout.signal,
    });
  } catch (err) {
    console.error("Local LLM Error:", err);
    return null;
  } finally {
    timeout.stop();
  }
}

async function callOpenRouter(systemPrompt: string, messages: ChatTurn[]): Promise<string | null> {
  const openRouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!openRouterKey || openRouterKey === "sk-or-v1-...") return null;

  try {
    return await callOpenAiCompatible({
      baseUrl: "https://openrouter.ai/api/v1",
      model: process.env.OPENROUTER_MODEL?.trim() || "google/gemini-2.0-flash-exp:free",
      apiKey: openRouterKey,
      systemPrompt,
      messages,
    });
  } catch (err) {
    console.error("OpenRouter Error:", err);
    return null;
  }
}

async function callGemini(systemPrompt: string, messages: ChatTurn[]): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;

  const ai = new GoogleGenAI({ apiKey });
  const contents = messages.map((m) => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));

  try {
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
      },
    });
    return response.text || null;
  } catch (err) {
    console.error("Gemini Error:", err);
    return null;
  }
}

const FALLBACK_REPLY =
  "I'm having trouble connecting to my scientific database. Let's try that again.";

export async function getSocraticResponse(
  messages: ChatTurn[],
  moduleContext?: string,
  studentContext?: string
) {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.text || "";
  const retrieved = retrieveGrade3Context(lastUser, { moduleContext, k: 3 });
  const systemPrompt = buildSystemPrompt(moduleContext, studentContext, retrieved || undefined);
  const provider = resolveAiProvider();

  const tryLocal = provider === "local" || provider === "auto";
  const tryOpenRouter = provider === "openrouter" || provider === "auto";
  const tryGemini = provider === "gemini" || provider === "auto";

  if (tryLocal) {
    const local = await callLocalLlm(systemPrompt, messages);
    if (local) return local;
    if (provider === "local") return FALLBACK_REPLY;
  }

  if (tryOpenRouter) {
    const openRouter = await callOpenRouter(systemPrompt, messages);
    if (openRouter) return openRouter;
    if (provider === "openrouter") {
      const gemini = await callGemini(systemPrompt, messages);
      return gemini || FALLBACK_REPLY;
    }
  }

  if (tryGemini) {
    const gemini = await callGemini(systemPrompt, messages);
    if (gemini) return gemini;
  }

  return FALLBACK_REPLY;
}