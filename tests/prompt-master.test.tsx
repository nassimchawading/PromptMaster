import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const BAND = {
  plugin: 'prompt-master',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const ROUGH = 'write me a python script that renames all my photos by the date they were taken'
const STRUCTURED =
  '## Goal\nRename photos by date taken.\n\n## Context\nPython.\n\n## Constraints\nNone stated.\n\n## Output format\nA script.\n\n## Before you start\nAsk 1–3 questions if ambiguous.'
const USAGE = {
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
}

/** The engine beneath the plugin: everything but the model. */
const engine = (on: On, store: Record<string, unknown> = {}) => {
  const toasts: string[] = []
  const statuses: (string | undefined)[] = []
  const filled: string[] = []
  on('store.get', (_, e) => ({ value: store[e.key] }))
  on('store.set', (_, e) => {
    store[e.key] = e.value

    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'pm' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('ui.status', (_, e) => {
    statuses.push(e.text)

    return { value: undefined }
  })
  on('prompt.read', () => ({ value: { text: ROUGH, cursor: ROUGH.length } }))
  on('prompt.fill', (_, e) => {
    filled.push(e.text)

    return { isFilled: true, text: e.text, cursor: e.text.length }
  })

  return { toasts, statuses, filled, store }
}

const answers = (on: On, text: string) =>
  on('model.complete', () => ({ value: { isAnswered: true, text, usage: USAGE } }))

const submit = (text: string) => ({
  text,
  wait: false,
  origin: { kind: 'composer' } as const,
})

const start = { cwd: '/', surface: 'desktop', isInteractive: true } as const

const pm = (args: string) => ({
  command: 'pm',
  args,
  origin: { kind: 'composer' } as const,
  presentation: { isFullscreen: false, columns: 80 },
})

test('OFF by default: prompts pass through unchanged', async ($, on) => {
  const seen = engine(on)
  answers(on, STRUCTURED)
  await $.session.start(start)

  const out = await $.prompt.submit(submit(ROUGH))
  expect(out.text).toBe(ROUGH)
  expect(seen.toasts).toEqual([])
})

test('/pm turns it on, saves it, and the prompt is rewritten', async ($, on) => {
  const seen = engine(on)
  answers(on, STRUCTURED)
  await $.session.start(start)

  const ran = await $.command.run(pm(''))
  expect(ran.text).toBe('Prompt Master is ON.')
  expect(seen.store.isOn).toBe(true)
  expect(seen.statuses.at(-1)).toBe('Prompt Master ON')

  const out = await $.prompt.submit(submit(ROUGH))
  expect(out.text).toBe(STRUCTURED)
  expect(seen.toasts).toContain('✨ Prompt optimized')
})

test('the saved setting is restored at session start', async ($, on) => {
  const seen = engine(on, { isOn: true })
  answers(on, STRUCTURED)
  await $.session.start(start)

  expect(seen.statuses.at(-1)).toBe('Prompt Master ON')
  const out = await $.prompt.submit(submit(ROUGH))
  expect(out.text).toBe(STRUCTURED)
})

test('a failed or timed-out rewrite sends the original prompt', async ($, on) => {
  engine(on, { isOn: true })
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'aborted', usage: USAGE } }))
  await $.session.start(start)

  const out = await $.prompt.submit(submit(ROUGH))
  expect(out.text).toBe(ROUGH)
})

test('a malformed rewrite is ignored', async ($, on) => {
  engine(on, { isOn: true })
  answers(on, 'Sure! Here is your script: ...')
  await $.session.start(start)

  const out = await $.prompt.submit(submit(ROUGH))
  expect(out.text).toBe(ROUGH)
})

test('short replies and slash-command-like prompts are left alone', async ($, on) => {
  engine(on, { isOn: true })
  answers(on, STRUCTURED)
  await $.session.start(start)

  expect((await $.prompt.submit(submit('yes go ahead'))).text).toBe('yes go ahead')
  expect((await $.prompt.submit(submit(STRUCTURED))).text).toBe(STRUCTURED)
})

test('the band toggles ON/OFF and Optimize rewrites the draft, on every surface', async ($, on) => {
  const seen = engine(on)
  answers(on, STRUCTURED)
  await $.session.start(start)

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    await $.command.run(pm('off'))
    const ui = await $.ui.mount({ ...BAND, surface })

    expect((await ui.find({ key: 'toggle' }))?.text).toBe('OFF')
    await ui.press({ key: 'toggle' })
    expect((await ui.find({ key: 'toggle' }))?.text).toBe('ON')
    expect(seen.store.isOn).toBe(true)

    await ui.press({ key: 'optimize' })
    expect(seen.filled.at(-1)).toBe(STRUCTURED)
    await ui.unmount()
  }
})
