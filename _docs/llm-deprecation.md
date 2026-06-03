# LLM deprecation playbook

Anthropic / OpenAI retire models every ~12–18 months. When you get the
"`claude-sonnet-4-X` will be removed on YYYY-MM-DD" email, follow this. The
whole point of centralizing model IDs is that a swap is a one-file change.

## Single source of truth
All model IDs live in **`lib/ai/clients.ts`** in the `MODELS` map — nothing else
hardcodes a model string. Current mapping:

| Use | Constant | Model (today) |
|---|---|---|
| Bot replies + Suggest Reply | `MODELS.generation` | `claude-sonnet-4-6` |
| Message Assist + translate | `MODELS.rewrite` | `claude-haiku-4-5-20251001` |
| Embeddings (RAG) | `MODELS.embedding` | `text-embedding-3-small` (1536d) |
| Voice transcription | `MODELS.transcription` | `whisper-1` |

> If you ever find a raw model string outside `MODELS`, move it in — that's a bug.

## Steps

**1. Find every call site (sanity check the centralization holds):**
```bash
grep -rn "claude-\|gpt-\|text-embedding-\|whisper-" lib/ app/ | grep -v node_modules
```
Expect hits only in `lib/ai/clients.ts`. If others appear, refactor them onto `MODELS`.

**2. Pick the replacement** — same provider is the cheapest path (just a newer
model id). Cross-provider only if pricing/quality shifted meaningfully.

**3. Update `lib/ai/clients.ts`** — change the one constant:
```ts
export const MODELS = {
  generation: "claude-sonnet-4-X",   // ← bump here
  rewrite: "claude-haiku-4-X",
  embedding: "text-embedding-3-small",
  transcription: "whisper-1",
} as const;
```
⚠️ **Embeddings are special**: changing `MODELS.embedding` or its dimension
invalidates every stored vector in `bot_embeddings`. You must **re-embed all
knowledge sources** (re-run the embed pipeline per `bot_sources`) — a migration
+ backfill job, not a hot swap. Treat embedding changes as a project, not a tweak.

**4. Regression-test before shipping:**
- Run the Playwright smoke suite (catches breakage).
- Bot-quality check: send ~20 known queries to a test bot, compare replies to the
  previous model. If quality drops, tune prompts or pick a different model.

**5. Roll out behind a flag:**
- Ship to ~10% of orgs first (PostHog feature flag).
- Watch `bot_outcomes` for a spike in `fallback_no_knowledge` or `handoff`.
- Steady → roll to 100%. Regression → revert the one constant + redeploy.

## Cost guard
Hard monthly caps are set in each provider dashboard (see
`_docs/key-rotation.md`), and every AI call is gated by the per-org token budget
(`consume_ai_tokens`). A model swap shouldn't change those, but re-check the
per-token price when switching tiers/providers and update
`lib/billing/` cost assumptions if it moved.
