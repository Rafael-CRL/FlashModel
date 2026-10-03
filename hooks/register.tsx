import type { EngineInterface, Register } from 'claude-code'

import type { Effort } from './models'
import { defaultEffort, EFFORTS, effortsOf, fitEffort, isCurrent, isEffort, labelOf, selectable } from './models'

// What the band draws besides the names, measured to decide when to stack.
const MODEL_TITLE = 'Model  '
const EFFORT_TITLE = 'Effort '
const SEPARATOR = ' │ '
const DOWN = ' ‹ '
const UP = ' › '
const NONE = ' n/a'
const VALUE_WIDTH = Math.max(...EFFORTS.map(l => l.length))
const GAP = 4 // between the groups, and the room the band's own [-] mark takes

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

// The effort in force for a model, always one of the levels it takes.
async function effortOf($: EngineInterface, id: string): Promise<Effort | undefined> {
  if (effortsOf(id).length === 0) return undefined
  if (override !== undefined) return fitEffort(override, id)
  const seen = sent.get(id)
  if (seen !== undefined) return fitEffort(seen, id)
  if (isEffort(chosen)) return fitEffort(chosen, id)
  if (chosen === 'auto') return defaultEffort(id)
  const settings = (await $.settings.read()) as {
    effortLevel?: unknown
    modelSettings?: Record<string, { effortLevel?: unknown }>
  }
  const saved = settings.modelSettings?.[id]?.effortLevel ?? settings.effortLevel
  return isEffort(saved) ? fitEffort(saved, id) : defaultEffort(id)
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
    if (override !== undefined) return yield* next({ ...e, effort: fitEffort(override, e.model) })
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

    // Effort as a stepper: ‹ and › move one level; at either end the arrow dims and
    // does nothing, but stays focusable so Enter-stepping keeps its place. The value
    // sits in a fixed-width box, so › stays under the pointer while clicking through.
    const at = levels.indexOf(effort as Effort)
    const step = (key: string, label: string, to: Effort | undefined) => (
      <Button
        key={key}
        plain
        dimColor={to === undefined}
        label={label}
        onPress={() => (to === undefined ? undefined : switchEffort($, to))}
      />
    )

    // Stack the two groups when one row would not fit beside the band's own [-] mark.
    const modelWidth = (MODEL_TITLE + models.map(labelOf).join(SEPARATOR)).length
    const effortWidth =
      EFFORT_TITLE.length + (levels.length > 0 ? DOWN.length + VALUE_WIDTH + UP.length : NONE.length)
    const isStacked = modelWidth + GAP + effortWidth + GAP > e.props.bodyColumns

    return (
      <Box flexDirection={isStacked ? 'column' : 'row'} columnGap={4}>
        <Box>
          <Text dimColor>{MODEL_TITLE}</Text>
          {models.flatMap((m, i) => (i === 0 ? [model(m)] : [<Text dimColor>{SEPARATOR}</Text>, model(m)]))}
        </Box>
        <Box>
          <Text dimColor>{EFFORT_TITLE}</Text>
          {levels.length > 0 ? (
            <Box>
              {step('effort:down', DOWN, levels[at - 1])}
              <Box key="effort:value" width={VALUE_WIDTH} justifyContent="center">
                <Text bold>{effort}</Text>
              </Box>
              {step('effort:up', UP, levels[at + 1])}
            </Box>
          ) : (
            <Text dimColor>{NONE}</Text>
          )}
        </Box>
      </Box>
    )
  })
}
