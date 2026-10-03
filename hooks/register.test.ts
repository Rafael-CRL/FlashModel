import { describe, expect, mock, test } from 'claude-code/testing'

// The engine is stood in for: the Model row, the session's model, settings, /model and /effort.
const OPTIONS = ['default', 'sonnet', 'opus', 'haiku', 'fable', 'best', 'sonnet[1m]', 'opusplan']
const ID: Record<string, string> = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-5-5',
  fable: 'claude-fable-5-1',
}

type World = { model: string; models: string[]; efforts: string[]; toasts: string[] }

function world(on: any, start: string, { refuse = '', settings = {} as object } = {}): World {
  const state: World = { model: ID[start] ?? start, models: [], efforts: [], toasts: [] }
  on('config.list', async () => ({
    value: [{ key: 'model', label: 'Model', kind: 'choice', value: 'x', options: OPTIONS }],
  }))
  on('session.model', async () => ({ value: state.model }))
  on('settings.read', async () => ({ value: settings }))
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
    return { text: `Set effort level to ${e.args} (this session only)` }
  })
  on('classic.PostModelSwitch', async () => ({}))
  return state
}

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
    expect(s.efforts).toEqual([]) // never /effort: it would save the level as a default
    expect(s.toasts).toEqual(['Model → claude-opus-5-5 · high effort'])
  })

  test('an effort alone leaves the model as it is', async ($, on) => {
    const clock = mock.clock(on)
    const s = world(on, 'sonnet')
    await m($, clock, 'low')
    expect(s.models).toEqual([])
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
    for (const level of ['high', 'xhigh', 'max']) {
      await ui.press({ key: 'effort:up' })
      expect(await active(ui, level)).toBe(true)
    }
    expect(s.efforts).toEqual([])
    expect(await ui.find({ type: 'Button', key: 'effort:up' })).toBeUndefined()
    for (let i = 0; i < 4; i++) await ui.press({ key: 'effort:down' })
    expect(await active(ui, 'low')).toBe(true)
    expect(await ui.find({ type: 'Button', key: 'effort:down' })).toBeUndefined()
    await ui.unmount()
  })

  test('the value keeps one width, so › does not move', async ($, on) => {
    world(on, 'opus')
    const ui = await mount($)
    const widths: number[] = []
    await ui.press({ key: 'effort:down' })
    for (let i = 0; i < 5; i++) {
      widths.push((await ui.find({ type: 'Text', text: /^ *(low|medium|high|xhigh|max) *$/ })).text.length)
      if (i < 4) await ui.press({ key: 'effort:up' })
    }
    expect(widths).toHaveLength(5)
    expect(new Set(widths).size).toBe(1)
    await ui.unmount()
  })

  test('a level pressed in the band rides on main-conversation requests only', async ($, on) => {
    world(on, 'opus')
    const seen: (string | undefined)[] = []
    on('turn.step', async function* (_$: any, e: any) {
      seen.push(e.effort)
      return { turnId: 't', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
    })
    const ui = await mount($)
    await ui.press({ key: 'effort:down' })
    const step = (extra: object) =>
      $.turn.step({ turnId: 't', index: 0, model: ID.opus, effort: 'medium', messageCount: 1, ...extra })
    for await (const _ of step({})) void _
    for await (const _ of step({ agentId: 'sub' })) void _
    for await (const _ of step({ model: ID.haiku, effort: undefined })) void _
    expect(seen).toEqual(['low', 'medium', undefined])
    await ui.unmount()
  })

  test('the effort follows the person running /effort', async ($, on) => {
    world(on, 'sonnet')
    const ui = await mount($)
    await $.command.run({ command: 'effort', args: 'max' })
    expect(await active(ui, 'max')).toBe(true)
    await ui.unmount()
  })

  test('the person running /effort takes over from the chosen effort', async ($, on) => {
    world(on, 'opus')
    const ui = await mount($)
    await ui.press({ key: 'effort:down' })
    await $.command.run({ command: 'effort', args: 'max' })
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
