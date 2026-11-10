# Prompt Master

A Claude Code mod that turns rough prompts into well-structured ones before Claude sees them.

When it's **ON**, every prompt you send (8+ words) is rewritten by a fast model into:

- **Goal**: what you actually want
- **Context**: relevant background from your prompt
- **Constraints**: limits, tone, things to avoid
- **Output format**: how the answer should be laid out
- **Before you start**: Claude asks 1–3 clarifying questions first, but only if the request is ambiguous

If the rewrite fails or takes longer than 8 seconds, your original prompt is sent unchanged. Nothing is ever blocked.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install prompt-master --marketplace nassimchawading/PromptMaster
```

Answer `y` to add the marketplace, then pick the **user** scope (Enter) so it's on in every session.

From a shell:

```bash
claude plugin install prompt-master --marketplace nassimchawading/PromptMaster
```

In the Claude desktop app: click **+** next to the prompt box → **Plugins** → **Add marketplace** with `nassimchawading/PromptMaster` → **Add plugin**.

## Use

- **Band above the prompt box**: `Prompt Master: [ON/OFF] [✨ Optimize]`
  - **ON/OFF** toggles automatic rewriting on send.
  - **✨ Optimize** rewrites the draft you've typed *in place*, so you can review and edit it before sending (works whether auto-rewrite is on or off).
- **`/pm`** flips the toggle; `/pm on` and `/pm off` set it.
- While ON, the status line shows **Prompt Master ON**, and a **✨ Prompt optimized** toast appears each time a prompt is rewritten.
- The ON/OFF setting is remembered across restarts (per computer).

**Left alone:** slash commands, short replies (fewer than 8 words, like "yes go ahead"), prompts that are already structured, and messages not typed by you.

## Notes

- Each rewrite is one extra small model call (Haiku), adding roughly 1–3 seconds per prompt and a little usage.
- Works in Claude Code (terminal, desktop app, IDE extensions). It does not affect the claude.ai web chat.

## Develop

```bash
claude plugin validate .
claude plugin test .
```

## License

MIT
