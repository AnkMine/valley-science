import { afterEach, describe, expect, it, vi } from "vitest";
import { getSocraticResponse } from "../services/llm.js";

const ENV_KEYS = [
  "AI_PROVIDER",
  "LOCAL_LLM_TIMEOUT_MS",
  "LOCAL_LLM_BASE_URL",
  "OPENROUTER_API_KEY",
  "GEMINI_API_KEY",
] as const;

const FALLBACK_REPLY =
  "I'm having trouble connecting to my scientific database. Let's try that again.";

describe("local LLM timeout", () => {
  const previous: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    for (const key of ENV_KEYS) {
      const prior = previous[key];
      if (prior === undefined) delete process.env[key];
      else process.env[key] = prior;
    }
  });

  function useLocalProvider(timeoutMs: string) {
    for (const key of ENV_KEYS) previous[key] = process.env[key];
    process.env.AI_PROVIDER = "local";
    process.env.LOCAL_LLM_TIMEOUT_MS = timeoutMs;
    process.env.LOCAL_LLM_BASE_URL = "http://127.0.0.1:1234/v1";
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.GEMINI_API_KEY;
  }

  it("returns the local reply when the model answers before the deadline", async () => {
    useLocalProvider("5000");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "What did you observe?" } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      })
    );

    const reply = await getSocraticResponse([{ role: "user", text: "What is a force?" }]);
    expect(reply).toBe("What did you observe?");
  });

  it("aborts a hung local model and returns the fallback reply", async () => {
    useLocalProvider("50");
    vi.spyOn(console, "error").mockImplementation(() => {});

    let aborted = false;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) {
            reject(new Error("missing abort signal"));
            return;
          }
          const onAbort = () => {
            aborted = true;
            reject(signal.reason);
          };
          if (signal.aborted) onAbort();
          else signal.addEventListener("abort", onAbort);
        });
      })
    );

    const reply = await getSocraticResponse([{ role: "user", text: "What is a force?" }]);
    expect(aborted).toBe(true);
    expect(reply).toBe(FALLBACK_REPLY);
  });
});
