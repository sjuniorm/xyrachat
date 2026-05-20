import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// Default model identifiers. Use the dated aliases for production-stable
// behavior — Anthropic occasionally rolls minor changes into the unsuffixed
// aliases and we want predictable bills.
//
// claude-opus-4-7    — heaviest reasoning. Reserved for future advanced use.
// claude-sonnet-4-6  — bot replies, suggested replies (good quality, ~1/5
//                       the cost of Opus). Default for generation.
// claude-haiku-4-5   — message-assist rewrites, translations (cheap + fast).
export const MODELS = {
  generation: "claude-sonnet-4-6",
  rewrite: "claude-haiku-4-5-20251001",
  embedding: "text-embedding-3-small",
  transcription: "whisper-1",
} as const;

let _anthropic: Anthropic | null = null;
let _openai: OpenAI | null = null;

export function getAnthropic(): Anthropic {
  if (_anthropic) return _anthropic;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  _anthropic = new Anthropic({ apiKey });
  return _anthropic;
}

export function getOpenAI(): OpenAI {
  if (_openai) return _openai;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  _openai = new OpenAI({ apiKey });
  return _openai;
}

// Surface whether AI is configured so callers can short-circuit cleanly
// (e.g. the bot gate skips when ANTHROPIC_API_KEY isn't set yet).
export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}
