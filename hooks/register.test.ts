import { describe, expect, mock, test } from 'claude-code/testing'

// The engine is stood in for: the Model row, the session's model, settings, /model and /effort.
const OPTIONS = ['default', 'sonnet', 'opus', 'haiku', 'fable', 'best', 'sonnet[1m]', 'opusplan']
const ID: Record<string, string> = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-5-5',
  fable: 'claude-fable-5-1',
}

type World = {
  model: string
  models: string[]
  efforts: string[]
  toasts: string[]
  settings: any
  }

function world(on: any, start: string, { refuse = '', settings = {} as object } = {}): World {
  const state: World = { model: ID[start] ?? start, models: [], efforts: [], toasts: [], settings }
  on('config.list', async () => ({
    value: [{ key: 'model', label: 'Model', kind: 'choice', value: 'x', options: OPTIONS }],
  }))
  on('session.model', async () => ({ value: state.model }))
  on('settings.read', async () => ({ value: state.settings }))
  on('ui.toast', async (_$: any, e: any) => {
    state.toasts.push(e.text)
    return { value: undefined }
  })
  on('command.run', { command: 'model' }, async (_$: any, e: any) => {
    state.models.push(e.args)
    if (e.args !== refuse) state.model = ID[e.args] ?? e.args
    return {}
  })
  on('command.run', { command: 'effort' }, async (_$: any, e: any) => {
    state.efforts.push(e.args)
    if (e.args === refuse) return { text: `Not applied: CLAUDE_CODE_EFFORT_LEVEL=low overrides effort this session` }
    return { text: `Set effort level to ${e.args} (saved as your default for new sessions)` }
  })
  on('classic.PostModelSwitch', async () => ({}))
  on('classic.ConfigChange', async () => ({}))
  return state
}

// Claude Code's own report of a command, as the transcript keeps it. The harness has
// nothing beneath the plugins to store the row, so its error after FlashModel read it is expected.
const report = ($: any, text: string, agentId?: string) =>
  $.session.append({
    message: { type: 'user', role: 'user', content: [{ type: 'text', text: `<local-command-stdout>${text}</local-command-stdout>` }] },
    door: 'command',
    origin: { kind: 'composer' },
    uuid: 'row',
    ...(agentId === undefined ? {} : { agentId }),
  }).catch(() => undefined)

async function m($: any, clock: any, args = '') {
  await $.command.run({ command: 'm', args })
  await clock.settle()
}

describe('/m', () => {
  for (const [start, next] of [['haiku', 'sonnet'], ['sonnet', 'opus'], ['opus', 'haiku']]) {
    test(`from ${start} it switches to ${next}`, async ($, on) => {
      const clock = mock.clock(on)
      const s = world(on, start)
      await m($, clock)
      expect(s.models).toEqual([next])
    })
  }

  test('confirms the new model and its effort in a toast', async ($, on) => {
    const clock = mock.clock(on)
    const s = world(on, 'haiku')
    await m($, clock)
    expect(s.toasts).toEqual(['Model → claude-sonnet-5-5 · medium effort'])
  })

  test('repeated presses cycle Haiku, Sonnet, Opus and never reach Fable', async ($, on) => {
    const clock = mock.clock(on)
    const s = world(on, 'opus')
    for (let i = 0; i < 6; i++) await m($, clock)
    expect(s.models).toEqual(['haiku', 'sonnet', 'opus', 'haiku', 'sonnet', 'opus'])
  })

  test('an unrecognised current model moves to the first entry', async ($, on) => {
    const clock = mock.clock(on)
    const s = world(on, 'claude-mystery-1')
    await m($, clock)
    expect(s.models).toEqual(['haiku'])
  })

  test('a model argument selects it, Fable included', async ($, on) => {
    const clock = mock.clock(on)
    const s = world(on, 'sonnet')
    await m($, clock, 'fable')
    expect(s.models).toEqual(['fable'])
  })

  test('a model and an effort switch both', async ($, on) => {
    const clock = mock.clock(on)
    const s = world(on, 'sonnet')
    await m($, clock, 'opus high')
    expect(s.models).toEqual(['opus'])
    expect(s.efforts).toEqual(['high'])
    expect(s.toasts).toEqual(['Model → claude-opus-5-5 · high effort'])
  })

  test('an effort alone leaves the model as it is', async ($, on) => {
    const clock = mock.clock(on)
    const s = world(on, 'sonnet')
    await m($, clock, 'low')
    expect(s.models).toEqual([])
    expect(s.efforts).toEqual(['low'])
    expect(s.toasts).toEqual(['Model → claude-sonnet-5-5 · low effort'])
  })

  test('a refused model is skipped, now and on later presses', async ($, on) => {
    const clock = mock.clock(on)
    const s = world(on, 'sonnet', { refuse: 'opus' })
    await m($, clock)
    expect(s.models).toEqual(['opus', 'haiku'])
    s.model = ID.sonnet
    s.models.length = 0
    await m($, clock)
    expect(s.models).toEqual(['haiku'])
  })

  test('a model that does not take is reported, not announced', async ($, on) => {
    const clock = mock.clock(on)
    const s = world(on, 'sonnet', { refuse: 'opus' })
    await m($, clock, 'opus')
    expect(s.toasts).toEqual(['Model unchanged: claude-sonnet-5-5'])
  })
})

describe('the band', () => {
  const PROPS = {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  }
  const mount = ($: any, surface: 'terminal' | 'desktop' = 'terminal', props = PROPS) =>
    $.ui.mount({ plugin: 'flashmodel', surface, component: 'AbovePrompt', props })
  const buttons = async (ui: any) => (await ui.findAll({ type: 'Button' })).map((b: any) => b.text)
  const active = async (ui: any, text: string) => (await ui.find({ type: 'Text', text }))?.props?.bold

  for (const surface of ['terminal', 'desktop'] as const) {
    test(`${surface}: offers the other models and efforts, and switches the model on press`, async ($, on) => {
      const s = world(on, 'sonnet')
      const ui = await mount($, surface)
      // Sonnet 5.5 defaults to medium, so the stepper can go both ways.
      expect(await buttons(ui)).toEqual(['Haiku', 'Opus', ' ‹ ', ' › '])
      expect(await active(ui, 'Sonnet')).toBe(true)
      expect(await active(ui, 'medium')).toBe(true)

      await ui.press({ key: 'model:opus' })
      expect(s.models).toEqual(['opus'])
      expect(await buttons(ui)).toEqual(['Haiku', 'Sonnet', ' ‹ ', ' › '])
      await ui.unmount()
    })
  }

  test('the stepper moves one level per press and rests at either end', async ($, on) => {
    const s = world(on, 'opus')
    const ui = await mount($)
    const arrow = async (key: string) => (await ui.find({ type: 'Button', key }))?.props
    expect((await arrow('effort:up'))?.dimColor).toBe(false)
    for (const level of ['high', 'xhigh', 'max']) {
      await ui.press({ key: 'effort:up' })
      expect(await active(ui, level)).toBe(true)
    }
    expect(s.efforts).toEqual(['high', 'xhigh', 'max'])
    // At the end the arrow dims and does nothing, but stays a Button so focus keeps its place.
    expect((await arrow('effort:up'))?.dimColor).toBe(true)
    await ui.press({ key: 'effort:up' })
    expect(await active(ui, 'max')).toBe(true)
    for (let i = 0; i < 5; i++) await ui.press({ key: 'effort:down' })
    expect(await active(ui, 'low')).toBe(true)
    expect((await arrow('effort:down'))?.dimColor).toBe(true)
    await ui.unmount()
  })

  test('the value sits in a fixed-width box, so › does not move', async ($, on) => {
    world(on, 'opus')
    const ui = await mount($)
    const widths = new Set<unknown>()
    for (let i = 0; i < 4; i++) {
      widths.add((await ui.find({ key: 'effort:value' }))?.props?.width)
      await ui.press({ key: 'effort:down' })
    }
    expect([...widths]).toEqual([6])
    await ui.unmount()
  })

  test('a level the model does not take shows the nearest one below, and steps from there', async ($, on) => {
    world(on, 'claude-sonnet-4-6', { settings: { effortLevel: 'xhigh' } })
    const ui = await mount($)
    expect(await active(ui, 'high')).toBe(true)
    await ui.press({ key: 'effort:up' })
    expect(await active(ui, 'max')).toBe(true)
    await ui.press({ key: 'effort:down' })
    expect(await active(ui, 'high')).toBe(true)
    await ui.unmount()
  })

  test('effort presses run /effort, so Claude Code and the band agree', async ($, on) => {
    const s = world(on, 'opus')
    const ui = await mount($)
    await ui.press({ key: 'effort:up' })
    expect(s.efforts).toEqual(['high'])
    expect(await active(ui, 'high')).toBe(true)
    await ui.unmount()
  })

  test('requests go out with the effort Claude Code chose', async ($, on) => {
    world(on, 'opus')
    const seen: (string | undefined)[] = []
    on('turn.step', async function* (_$: any, e: any) {
      seen.push(e.effort)
      return { turnId: 't', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
    })
    const ui = await mount($)
    await ui.press({ key: 'effort:down' })
    for await (const _ of $.turn.step({ turnId: 't', index: 0, model: ID.opus, effort: 'low', messageCount: 1 })) void _
    expect(seen).toEqual(['low'])
    await ui.unmount()
  })

  test('a refused /effort leaves the band as it was', async ($, on) => {
    const s = world(on, 'opus', { refuse: 'high' })
    const ui = await mount($)
    await ui.press({ key: 'effort:up' })
    expect(s.efforts).toEqual(['high'])
    expect(await active(ui, 'medium')).toBe(true)
    expect(s.toasts).toEqual(['Could not switch to high'])
    await ui.unmount()
  })

  test('a saved level changed elsewhere shows when the session has no choice of its own', async ($, on) => {
    const s = world(on, 'opus', { settings: { modelSettings: { 'claude-opus-5-5': { effortLevel: 'low' } } } })
    const ui = await mount($)
    expect(await active(ui, 'low')).toBe(true)
    s.settings = { modelSettings: { 'claude-opus-5-5': { effortLevel: 'max' } } }
    await $.classic.ConfigChange({ source: 'user_settings' } as any)
    expect(await active(ui, 'max')).toBe(true)
    await ui.unmount()
  })

  test('an effort chosen in the model picker shows, even when only for this session', async ($, on) => {
    world(on, 'opus')
    const ui = await mount($)
    await report($, 'Set model to `Opus 5.5` for this session only with `max` effort')
    expect(await active(ui, 'max')).toBe(true)
    await ui.unmount()
  })

  test('leaving the picker without a change keeps the effort', async ($, on) => {
    world(on, 'opus')
    const ui = await mount($)
    await report($, 'Kept model as Opus 5.5')
    expect(await active(ui, 'medium')).toBe(true)
    await ui.unmount()
  })

  test('output of other commands, and of subagents, is not taken for an effort report', async ($, on) => {
    world(on, 'opus')
    const ui = await mount($)
    await report($, 'Compacted with high fidelity')
    await report($, 'Set effort level to max (this session only)', 'sub')
    expect(await active(ui, 'medium')).toBe(true)
    await ui.unmount()
  })

  test('the original mix-up: a band level, then a picker save, shows the picker level', async ($, on) => {
    world(on, 'opus')
    const ui = await mount($)
    await ui.press({ key: 'effort:down' })
    expect(await active(ui, 'low')).toBe(true)
    await report($, 'Set model to `Opus 5.5` and saved as your default for new sessions with `medium` effort')
    expect(await active(ui, 'medium')).toBe(true)
    await ui.unmount()
  })

  test('an unrelated settings change keeps the session effort', async ($, on) => {
    const s = world(on, 'opus', { settings: { modelSettings: { 'claude-opus-5-5': { effortLevel: 'low' } } } })
    const ui = await mount($)
    await ui.press({ key: 'effort:up' })
    s.settings = { ...s.settings, theme: 'light' }
    await $.classic.ConfigChange({ source: 'user_settings' } as any)
    expect(await active(ui, 'medium')).toBe(true)
    await ui.unmount()
  })

  test('the effort follows the person running /effort', async ($, on) => {
    world(on, 'sonnet')
    const ui = await mount($)
    await report($, 'Set effort level to max (this session only): Maximum capability')
    expect(await active(ui, 'max')).toBe(true)
    await ui.unmount()
  })

  test('the effort follows what a request actually sent', async ($, on) => {
    world(on, 'sonnet')
    on('turn.step', async function* () {
      return { turnId: 't', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
    })
    const ui = await mount($)
    const steps = $.turn.step({ turnId: 't', index: 0, model: ID.sonnet, effort: 'high', messageCount: 1 })
    for await (const _ of steps) void _
    expect(await active(ui, 'high')).toBe(true)
    await ui.unmount()
  })

  test('a saved per-model effort is shown before any request', async ($, on) => {
    world(on, 'opus', { settings: { modelSettings: { 'claude-opus-5-5': { effortLevel: 'high' } } } })
    const ui = await mount($)
    expect(await active(ui, 'high')).toBe(true)
    await ui.unmount()
  })

  test('stacks Model and Effort when one row would not fit', async ($, on) => {
    world(on, 'sonnet')
    const wide = await mount($)
    expect((await wide.drawn()).props.flexDirection).toBe('row')
    await wide.unmount()
    const narrow = await mount($, 'terminal', { ...PROPS, bodyColumns: 50 })
    expect((await narrow.drawn()).props.flexDirection).toBe('column')
    await narrow.unmount()
  })

  test('Haiku shows effort as not applicable', async ($, on) => {
    world(on, 'haiku')
    const ui = await mount($)
    expect(await buttons(ui)).toEqual(['Sonnet', 'Opus'])
    expect(await ui.find({ type: 'Text', text: 'n/a' })).toBeDefined()
    await ui.unmount()
  })

  test('redraws when the model changes elsewhere', async ($, on) => {
    const s = world(on, 'sonnet')
    const ui = await mount($)
    s.model = ID.haiku
    await $.classic.PostModelSwitch({
      from_model: ID.sonnet,
      to_model: ID.haiku,
      requested_model: 'haiku',
      source: 'picker',
      context_tokens: 0,
    } as any)
    expect(await active(ui, 'Haiku')).toBe(true)
    await ui.unmount()
  })

  test('leaves the band to a survey', async ($, on) => {
    world(on, 'sonnet')
    on('ui.render', { component: 'AbovePrompt' }, async ($: any, e: any) =>
      $.ui.resolve(e).Text({ children: ['the survey'] }),
    )
    const ui = await mount($, 'terminal', { ...PROPS, hasSurvey: true })
    expect(await buttons(ui)).toEqual([])
    await ui.unmount()
  })
})
