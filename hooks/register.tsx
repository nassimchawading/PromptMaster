import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { OptimizeStatus } from '../types'

// Whether rewriting on send is on. Mirrored to `$.store` so it survives
// restarts; the atom is what the band reads, so a flip redraws it.
const isOn = atom({ plugin: 'prompt-master', key: 'isOn' } as const, false)
const optimize = atom(
  { plugin: 'prompt-master', key: 'optimize' } as const,
  'idle' as OptimizeStatus,
)

const STORE_KEY = 'isOn'
const MODEL = 'haiku'
const TIMEOUT_MS = 8000
// Replies like "yes", "go on" or "fix the typo" are left alone.
const MIN_WORDS = 8
// Prompts that come from the person: typed, from a phone/web client, or an SDK host.
const PERSON_ORIGINS = new Set(['composer', 'bridge', 'sdk'])

const SYSTEM = `You are Prompt Master. You rewrite a user's rough request into a clear, well-structured prompt for an AI assistant.

Rules:
- Output ONLY the rewritten prompt. No preamble, no commentary, no code fences around the whole thing.
- Do NOT answer or carry out the request yourself.
- Keep the user's language, and keep every concrete detail they gave (names, paths, numbers, code, quoted text) exactly as written.
- Do not invent facts. Where the user gave no information for a section, write a short sensible default or "None stated".
- Be concise: no padding.

Use exactly this layout:

## Goal
<what the user actually wants, in one or two sentences>

## Context
<relevant background taken from the user's prompt>

## Constraints
<limits, tone, things to avoid>

## Output format
<how the answer should be laid out>

## Before you start
If any part of this request is ambiguous, ask me 1–3 short clarifying questions first and wait for my answers. If it is clear, go ahead without asking.`

/** True when the text already has Prompt Master's layout (an optimized draft). */
const isStructured = (text: string) =>
  text.includes('## Goal') && text.includes('## Output format')

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length

/**
 * Rewrites `text` through the model. Resolves undefined on any failure or
 * timeout, so callers fall back to the original text.
 */
const rewrite = async ($: EngineInterface, text: string): Promise<string | undefined> => {
  try {
    const r = await $.model.complete({
      model: MODEL,
      system: SYSTEM,
      prompt: `Rewrite this request:\n\n<request>\n${text}\n</request>`,
      maxTokens: 1500,
      effort: 'low',
      timeoutMs: TIMEOUT_MS,
    })
    if (!r.isAnswered) {
      return undefined
    }
    const out = r.text.trim()

    return isStructured(out) ? out : undefined
  } catch {
    return undefined
  }
}

const showStatus = ($: EngineInterface, on: boolean) =>
  $.ui.status(on ? 'Prompt Master ON' : undefined)

const setOn = async ($: EngineInterface, on: boolean) => {
  await update($, isOn, () => on)
  showStatus($, on)
  try {
    await $.store.set(STORE_KEY, on)
  } catch {
    // The toggle still works for this session if the store write fails.
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pm',
      description: 'Prompt Master: toggle prompt rewriting (/pm, /pm on, /pm off)',
    })
    const saved = (await $.store.get(STORE_KEY)) === true
    await update($, isOn, () => saved)
    showStatus($, saved)

    return next(e)
  })

  on('command.run', { command: 'pm' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const current = await read($, isOn)
    const want = arg === 'on' ? true : arg === 'off' ? false : !current
    await setOn($, want)

    return { text: `Prompt Master is ${want ? 'ON' : 'OFF'}.` }
  })

  on('prompt.submit', async ($, e, next) => {
    const skip =
      e.command !== undefined ||
      e.isMeta === true ||
      !PERSON_ORIGINS.has(e.origin.kind) ||
      wordCount(e.text) < MIN_WORDS ||
      isStructured(e.text) ||
      !(await read($, isOn))
    if (skip) {
      return next(e)
    }

    $.ui.status('Prompt Master: optimizing…')
    const better = await rewrite($, e.text)
    showStatus($, true)
    if (better === undefined) {
      $.ui.toast('Prompt Master: rewrite failed, sent your original prompt')

      return next(e)
    }
    $.ui.toast('✨ Prompt optimized')

    return next({ ...e, text: better })
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }
    const { Box, Button, Text } = $.ui.resolve(e)
    const active = await read($, isOn)
    const status = await read($, optimize)

    const onOptimize = async () => {
      if ((await read($, optimize)) === 'working') {
        return
      }
      const { text } = await $.prompt.read()
      if (text.trim() === '') {
        $.ui.toast('Prompt Master: type a prompt first')

        return
      }
      await update($, optimize, () => 'working')
      try {
        const better = await rewrite($, text)
        if (better === undefined) {
          $.ui.toast('Prompt Master: rewrite failed, your draft is unchanged')

          return
        }
        // Only replace the draft if the person has not changed it meanwhile.
        const now = await $.prompt.read()
        if (now.text !== text) {
          $.ui.toast('Prompt Master: draft changed while optimizing, left it as is')

          return
        }
        await $.prompt.fill({ text: better, mode: 'replace' })
        $.ui.toast('✨ Draft optimized: review it, then send')
      } finally {
        await update($, optimize, () => 'idle')
      }
    }

    return (
      <Box flexDirection="row" gap={1}>
        <Text dimColor>Prompt Master:</Text>
        <Button
          key="toggle"
          label={active ? 'ON' : 'OFF'}
          variant={active ? 'primary' : 'secondary'}
          onPress={() => void setOn($, !active)}
        />
        <Button
          key="optimize"
          label={status === 'working' ? '✨ Optimizing…' : '✨ Optimize'}
          onPress={() => void onOptimize()}
        />
      </Box>
    )
  })
}
