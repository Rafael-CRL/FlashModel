import type { EngineInterface, Register } from 'claude-code'

import type { Effort } from './models'
import { defaultEffort, effortsOf, isCurrent, isEffort, labelOf, selectable } from './models'

// Session state, rebuilt on a reload. Claude Code has no getter for the effort in
// force, so FlashModel follows it: the last /effort run, and what each request sent.
const refused = new Set<string>() // models /model refused this session
const sent = new Map<string, Effort>() // model id → effort its last main-loop request carried
let chosen: Effort | 'auto' | undefined // the last /effort level this session
let pending: string | undefined // the band segment being switched to

async function modelRow($: EngineInterface) {
  return selectable((await $.config.list()).find(r => r.key === 'model')?.options)
}

async function effortOf($: EngineInterface, id: string): Promise<Effort | undefined> {
  if (effortsOf(id).length === 0) return undefined
  const seen = sent.get(id)
  if (seen !== undefined) return seen
  if (isEffort(chosen)) return chosen
  if (chosen === 'auto') return defaultEffort(id)
  const settings = (await $.settings.read()) as {
    effortLevel?: unknown
    modelSettings?: Record<string, { effortLevel?: unknown }>
  }
  const saved = settings.modelSettings?.[id]?.effortLevel ?? settings.effortLevel
  return isEffort(saved) ? saved : defaultEffort(id)
}

// Runs /model for each target until the session's model changes; true if it did.
// Never inside a command hook: /model waits on the turn, so a command queues it.
async function switchModel($: EngineInterface, targets: string[], isCycle: boolean) {
  const before = await $.session.model()
  for (const target of targets.filter(m => !isCycle || !refused.has(m))) {
    await $.command.run({ command: 'model', args: target })
    const now = await $.session.model()
    if (now !== before) return now
    if (isCycle) refused.add(target)
  }
  return undefined
}

async function switchEffort($: EngineInterface, level: Effort) {
  const { text } = await $.command.run({ command: 'effort', args: level })
  const isSet = text === undefined || /\bset\b/i.test(text)
  if (isSet) {
    chosen = level
    sent.clear()
  }
  return isSet
}

// A band press: mark the segment pending, switch, redraw. The band is the confirmation.
async function press($: EngineInterface, segment: string, run: () => Promise<unknown>) {
  pending = segment
  $.ui.invalidate('ui.render')
  const isDone = await run()
  pending = undefined
  if (!isDone) $.ui.toast(`Could not switch to ${segment.split(':')[1]}`)
  $.ui.invalidate('ui.render')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'm',
      description: 'Switch to the next Claude model, or to a model and effort',
      argumentHint: '[model] [effort]',
      immediate: true,
    })
    return next(e)
  })

  // Any route that changes the model (the band, /m, /model, the picker) redraws the band.
  on('classic.PostModelSwitch', async ($, e, next) => {
    $.ui.invalidate('ui.render')
    return next(e)
  })

  // The person's own /effort; FlashModel's runs skip its own hooks and record themselves.
  on('command.run', { command: 'effort' }, async ($, e, next) => {
    const result = await next(e)
    const level = (e.args ?? '').trim()
    if (isEffort(level) || level === 'auto') chosen = level
    if (level === '') chosen = undefined // the slider: settings say what it saved
    sent.clear()
    $.ui.invalidate('ui.render')
    return result
  })

  // The effort each main-loop request carries is the ground truth; keep the last one.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined && isEffort(e.effort) && sent.get(e.model) !== e.effort) {
      sent.set(e.model, e.effort)
      $.ui.invalidate('ui.render')
    }
    return yield* next(e)
  })

  on('command.run', { command: 'm' }, async ($, e) => {
    const models = await modelRow($)
    if (models.length === 0) return { text: 'FlashModel: no models to switch between.' }

    const words = (e.args ?? '').trim().split(/\s+/).filter(Boolean)
    const level = words.find(isEffort)
    const asked = words.find(w => !isEffort(w))
    const before = await $.session.model()
    const from = models.findIndex(m => isCurrent(before, m))
    const queue = asked
      ? [asked]
      : level
        ? []
        : models.map((_, i) => models[(from + 1 + i) % models.length])

    $.clock.after(0, async () => {
      const now = queue.length > 0 ? await switchModel($, queue, !asked) : before
      if (now === undefined) return $.ui.toast(`Model unchanged: ${before}`)
      const isSet = level === undefined || (await switchEffort($, level))
      const effort = await effortOf($, now)
      $.ui.toast(`Model → ${now}${effort ? ` · ${effort} effort` : ''}${isSet ? '' : ' (effort unchanged)'}`)
      $.ui.invalidate('ui.render')
    })
    return {}
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const models = await modelRow($)
    if (e.props.hasSurvey || models.length < 2) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const id = await $.session.model()
    const levels = effortsOf(id)
    const effort = await effortOf($, id)

    // One segment: the active one bright, the one being switched to in italics, the rest pressable.
    const segment = (key: string, label: string, isActive: boolean, run: () => Promise<unknown>) =>
      isActive ? (
        <Text key={key} bold color="claude">
          {label}
        </Text>
      ) : key === pending ? (
        <Text key={key} italic dimColor>
          {`${label}…`}
        </Text>
      ) : (
        <Button key={key} plain dimColor label={label} onPress={() => press($, key, run)} />
      )

    const group = (title: string, items: ReturnType<typeof segment>[]) => (
      <Box>
        <Text dimColor>{`${title}  `}</Text>
        {items.flatMap((item, i) => (i === 0 ? [item] : [<Text dimColor>{' │ '}</Text>, item]))}
      </Box>
    )

    return (
      <Box columnGap={4} flexWrap="wrap">
        {group(
          'Model',
          models.map(m =>
            segment(`model:${m}`, labelOf(m), isCurrent(id, m), () => switchModel($, [m], false)),
          ),
        )}
        {levels.length > 0 ? (
          group(
            'Effort',
            levels.map(l => segment(`effort:${l}`, l, l === effort, () => switchEffort($, l))),
          )
        ) : (
          <Text dimColor>Effort  n/a</Text>
        )}
      </Box>
    )
  })
}
