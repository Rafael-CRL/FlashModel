import type { EngineInterface, Register } from 'claude-code'

import type { Effort } from './models'
import { defaultEffort, effortsOf, isCurrent, isEffort, labelOf, selectable } from './models'

// Session state, rebuilt on a reload. Claude Code has no getter for the effort in
// force, so FlashModel follows it: the last /effort run, and what each request sent.
// /effort <level> saves the level as the model's default, so FlashModel never runs it:
// its own choice rides on each main-conversation request instead, for this session only.
const refused = new Set<string>() // models /model refused this session
const sent = new Map<string, Effort>() // model id → effort its last main-loop request carried
let chosen: Effort | 'auto' | undefined // the last /effort level this session
let override: Effort | undefined // FlashModel's effort, until the person runs /effort
let pending: string | undefined // the band segment being switched to

async function modelRow($: EngineInterface) {
  return selectable((await $.config.list()).find(r => r.key === 'model')?.options)
}

async function effortOf($: EngineInterface, id: string): Promise<Effort | undefined> {
  const levels = effortsOf(id)
  if (levels.length === 0) return undefined
  if (override !== undefined && levels.includes(override)) return override
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

function switchEffort($: EngineInterface, level: Effort) {
  override = level
  $.ui.invalidate('ui.render')
  return true
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
    override = undefined
    sent.clear()
    $.ui.invalidate('ui.render')
    return result
  })

  // Main-conversation requests carry FlashModel's effort where the model takes it;
  // otherwise the effort a request carries is the ground truth, kept per model.
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined || e.effort === undefined) return yield* next(e)
    if (override !== undefined && effortsOf(e.model).includes(override)) {
      return yield* next({ ...e, effort: override })
    }
    if (isEffort(e.effort) && sent.get(e.model) !== e.effort) {
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
      if (level !== undefined) switchEffort($, level)
      const effort = await effortOf($, now)
      $.ui.toast(`Model → ${now}${effort ? ` · ${effort} effort` : ''}`)
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

    // A model: the active one bold, the one being switched to in italics, the rest pressable.
    const model = (m: string) => {
      const key = `model:${m}`
      if (isCurrent(id, m)) return <Text key={key} bold>{labelOf(m)}</Text>
      if (key === pending) return <Text key={key} italic dimColor>{`${labelOf(m)}…`}</Text>
      return <Button key={key} plain dimColor label={labelOf(m)} onPress={() => press($, key, () => switchModel($, [m], false))} />
    }

    // Effort as a stepper: ‹ and › move one level, past either end they rest dim.
    // The value keeps one width, so › stays under the pointer while clicking through.
    const at = levels.indexOf(effort as Effort)
    const width = Math.max(0, ...levels.map(l => l.length))
    const value = effort === undefined ? '' : effort.padStart((width + effort.length) / 2).padEnd(width)
    const step = (key: string, glyph: string, to: Effort | undefined) =>
      to === undefined ? (
        <Text key={key} dimColor>{` ${glyph} `}</Text>
      ) : (
        <Button key={key} plain dimColor label={` ${glyph} `} onPress={() => switchEffort($, to)} />
      )

    // Stack the two groups when one row would not fit beside the band's own [-] mark.
    const modelWidth = 7 + models.reduce((n, m) => n + m.length + 3, -3)
    const effortWidth = 7 + (levels.length > 0 ? width + 6 : 4)
    const isStacked = modelWidth + 4 + effortWidth + 4 > e.props.bodyColumns

    return (
      <Box flexDirection={isStacked ? 'column' : 'row'} columnGap={4}>
        <Box>
          <Text dimColor>{'Model  '}</Text>
          {models.flatMap((m, i) => (i === 0 ? [model(m)] : [<Text dimColor>{' │ '}</Text>, model(m)]))}
        </Box>
        <Box>
          <Text dimColor>{'Effort '}</Text>
          {levels.length > 0 ? (
            <Box>
              {step('effort:down', '‹', levels[at - 1])}
              <Text bold>{value}</Text>
              {step('effort:up', '›', levels[at + 1])}
            </Box>
          ) : (
            <Text dimColor> n/a</Text>
          )}
        </Box>
      </Box>
    )
  })
}
