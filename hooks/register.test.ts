import { describe, expect, mock, test } from 'claude-code/testing'

// The engine is stood in for: the Model row's options, the session's model and /model.
const OPTIONS = ['default', 'sonnet', 'opus', 'haiku', 'fable', 'best', 'sonnet[1m]', 'opusplan']
// Cycle order: smallest to largest, whatever order the engine lists them in.
const CYCLE = ['haiku', 'sonnet', 'opus', 'fable']

function world(on: any, start: string, refuse = '') {
  const state = { model: `claude-${start}-9`, asked: [] as string[], toasts: [] as string[] }
  on('config.list', async () => ({
    value: [{ key: 'model', label: 'Model', kind: 'choice', value: 'x', options: OPTIONS }],
  }))
  on('session.model', async () => ({ value: state.model }))
  on('ui.toast', async (_$: any, e: any) => {
    state.toasts.push(e.text)
    return { value: undefined }
  })
  on('command.run', { command: 'model' }, async (_$: any, e: any) => {
    state.asked.push(e.args)
    if (e.args !== refuse) state.model = `claude-${e.args}-9`
    return {}
  })
  return state
}

describe('/m', () => {
  for (const [i, start] of CYCLE.entries()) {
    test(`from ${start} it switches to ${CYCLE[(i + 1) % CYCLE.length]}`, async ($, on) => {
      const clock = mock.clock(on)
      const s = world(on, start)
      await $.command.run({ command: 'm' })
      await clock.settle()
      expect(s.asked).toEqual([CYCLE[(i + 1) % CYCLE.length]])
    })
  }

  test('shows the new model in a toast', async ($, on) => {
    const clock = mock.clock(on)
    const s = world(on, 'sonnet')
    await $.command.run({ command: 'm' })
    await clock.settle()
    expect(s.toasts).toEqual(['Model → opus (claude-opus-9)'])
  })

  test('repeated presses walk the whole list and return to the start', async ($, on) => {
    const clock = mock.clock(on)
    const s = world(on, 'sonnet')
    for (let i = 0; i < CYCLE.length + 1; i++) {
      await $.command.run({ command: 'm' })
      await clock.settle()
    }
    expect(s.asked).toEqual(['opus', 'fable', 'haiku', 'sonnet', 'opus'])
    expect(s.toasts).toHaveLength(5)
  })

  test('never lands on default, best, opusplan or a 1M variant', async ($, on) => {
    const clock = mock.clock(on)
    const s = world(on, 'fable')
    for (let i = 0; i < 12; i++) {
      await $.command.run({ command: 'm' })
      await clock.settle()
    }
    expect(s.asked.every(m => CYCLE.includes(m))).toBe(true)
  })

  test('an unrecognised current model moves to the first entry', async ($, on) => {
    const clock = mock.clock(on)
    const s = world(on, 'mystery')
    await $.command.run({ command: 'm' })
    await clock.settle()
    expect(s.asked).toEqual(['haiku'])
  })

  test('an explicit argument selects that model', async ($, on) => {
    const clock = mock.clock(on)
    const s = world(on, 'sonnet')
    await $.command.run({ command: 'm', args: 'haiku' })
    await clock.settle()
    expect(s.asked).toEqual(['haiku'])
  })

  test('a refused model is skipped, now and on later presses', async ($, on) => {
    const clock = mock.clock(on)
    const s = world(on, 'opus', 'fable')
    await $.command.run({ command: 'm' })
    await clock.settle()
    expect(s.asked).toEqual(['fable', 'haiku'])
    expect(s.toasts).toEqual(['Model → haiku (claude-haiku-9)'])

    s.model = 'claude-opus-9'
    s.asked.length = 0
    await $.command.run({ command: 'm' })
    await clock.settle()
    expect(s.asked).toEqual(['haiku'])
  })

  test('an unchanged model is reported, not announced as a switch', async ($, on) => {
    const clock = mock.clock(on)
    const s = world(on, 'sonnet')
    on('command.run', { command: 'model' }, async () => ({}))
    await $.command.run({ command: 'm', args: 'sonnet' })
    await clock.settle()
    expect(s.toasts[0]).toMatch(/^Model unchanged/)
  })
})

describe('the model band', () => {
  const PROPS = {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  }

  for (const surface of ['terminal', 'desktop'] as const) {
    test(`${surface}: lists the models, marks the active one, switches on press`, async ($, on) => {
      const s = world(on, 'sonnet')
      const ui = await $.ui.mount({ plugin: 'flashmodel', surface, component: 'AbovePrompt', props: PROPS })
      const labels = (await ui.findAll({ type: 'Button' })).map(b => b.text)
      expect(labels).toEqual(['Haiku', '● Sonnet', 'Opus', 'Fable'])

      await ui.press({ key: 'opus' })
      expect(s.asked).toEqual(['opus'])
      expect(s.toasts).toEqual(['Model → opus (claude-opus-9)'])
      await ui.unmount()
    })
  }

  test('redraws with the new active model after a switch', async ($, on) => {
    world(on, 'sonnet')
    on('classic.PostModelSwitch', async () => ({}))
    const ui = await $.ui.mount({ plugin: 'flashmodel', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
    await ui.press({ key: 'haiku' })
    await $.classic.PostModelSwitch({ from_model: 'x', to_model: 'claude-haiku-9', requested_model: 'haiku', source: 'picker', context_tokens: 0, is_cache_warm: false } as any)
    const labels = (await ui.findAll({ type: 'Button' })).map(b => b.text)
    expect(labels).toEqual(['● Haiku', 'Sonnet', 'Opus', 'Fable'])
    await ui.unmount()
  })

  test('pressing the active model does nothing', async ($, on) => {
    const s = world(on, 'sonnet')
    const ui = await $.ui.mount({ plugin: 'flashmodel', surface: 'terminal', component: 'AbovePrompt', props: PROPS })
    await ui.press({ key: 'sonnet' })
    expect(s.asked).toEqual([])
    await ui.unmount()
  })

  test('leaves the band to a survey', async ($, on) => {
    world(on, 'sonnet')
    on('ui.render', { component: 'AbovePrompt' }, async ($: any, e: any) => $.ui.resolve(e).Text({ children: ['the survey'] }))
    const ui = await $.ui.mount({ plugin: 'flashmodel', surface: 'terminal', component: 'AbovePrompt', props: { ...PROPS, hasSurvey: true } })
    expect(await ui.findAll({ type: 'Button' })).toEqual([])
    await ui.unmount()
  })
})
