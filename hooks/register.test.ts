import { describe, expect, mock, test } from 'claude-code/testing'

// The engine is stood in for: the Model row's options, the session's model and /model.
const OPTIONS = ['default', 'sonnet', 'opus', 'haiku', 'fable', 'best', 'sonnet[1m]', 'opusplan']
const CYCLE = ['sonnet', 'opus', 'haiku', 'fable']

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
    expect(s.asked).toEqual(['opus', 'haiku', 'fable', 'sonnet', 'opus'])
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
    expect(s.asked).toEqual(['sonnet'])
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
    const s = world(on, 'haiku', 'fable')
    await $.command.run({ command: 'm' })
    await clock.settle()
    expect(s.asked).toEqual(['fable', 'sonnet'])
    expect(s.toasts).toEqual(['Model → sonnet (claude-sonnet-9)'])

    s.model = 'claude-haiku-9'
    s.asked.length = 0
    await $.command.run({ command: 'm' })
    await clock.settle()
    expect(s.asked).toEqual(['sonnet'])
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
