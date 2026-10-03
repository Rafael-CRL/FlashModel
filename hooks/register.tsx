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
// force, so FlashModel follows it: what each request sent, the last /effort level of
// this session, the saved level, the model's default, in that order.
const refused = new Set<string>() // models /model refused this session
const sent = new Map<string, Effort>() // model id → effort its last main-loop request carried
let chosen: Effort | 'auto' | undefined // the session's effort, set by /effort or the picker
let pending: string | undefined // what a band press is switching to

async function modelRow($: EngineInterface) {
  return selectable((await $.config.list()).find(r => r.key === 'model')?.options)
}

async function savedEffort($: EngineInterface, id: string) {
  const settings = (await $.settings.read()) as {
    effortLevel?: unknown
    modelSettings?: Record<string, { effortLevel?: unknown }>
  }
  return settings.modelSettings?.[id]?.effortLevel ?? settings.effortLevel
}

// The effort in force for a model, always one of the levels it takes.
async function effortOf($: EngineInterface, id: string): Promise<Effort | undefined> {
  if (effortsOf(id).length === 0) return undefined
  const seen = sent.get(id)
  if (seen !== undefined) return fitEffort(seen, id)
  if (isEffort(chosen)) return fitEffort(chosen, id)
  if (chosen === 'auto') return defaultEffort(id)
  const level = await savedEffort($, id)
  return isEffort(level) ? fitEffort(level, id) : defaultEffort(id)
}

// What Claude Code reports after /model or /effort, the pickers and sliders included:
// "Set effort level to high (…)", "Effort level set to auto", or the model picker's
// "Set model to `Opus 5.5` for this session only with `max` effort".
const REPORT = /^(?:<local-command-stdout>)?(?:Set model to|Set effort level|Effort level set)/
const REPORTED = /(?:effort level (?:set )?to|with) `?(low|medium|high|xhigh|max|auto)\b/i

function reportedEffort(text: string | undefined): Effort | 'auto' | undefined {
  if (text === undefined || !REPORT.test(text)) return undefined
  const level = text.match(REPORTED)?.[1]?.toLowerCase()
  return isEffort(level) || level === 'auto' ? level : undefined
}

// Something may have changed the effort: forget what requests sent until the next one.
function effortChanged($: EngineInterface, level?: Effort | 'auto') {
  if (level !== undefined) chosen = level
  sent.clear()
  $.ui.invalidate('ui.render')
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

// Runs /effort, as typing it does: in an interactive session Claude Code also saves
// the level as the model's default. True once Claude Code reports it set.
async function switchEffort($: EngineInterface, level: Effort) {
  const { text } = await $.command.run({ command: 'effort', args: level })
  const isSet = text === undefined || reportedEffort(text) === level
  if (isSet) effortChanged($, level)
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
    effortChanged($)
    return next(e)
  })

  // The person's own /model and /effort, the pickers and sliders included, report the
  // effort they set in the transcript; take it up. FlashModel's own runs record themselves.
  on('session.append', async ($, e, next) => {
    if (e.door === 'command' && e.agentId === undefined) {
      const blocks = e.message.content as readonly { type: string; text?: string }[]
      const level = reportedEffort(blocks.map(b => b.text ?? '').join(''))
      if (level !== undefined) effortChanged($, level)
    }
    return next(e)
  })

  // A settings change, here or from another session, can move the saved level.
  on('classic.ConfigChange', async ($, e, next) => {
    effortChanged($)
    return next(e)
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
      if (level !== undefined) await switchEffort($, level)
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
        onPress={() => (to === undefined ? undefined : press($, `effort:${to}`, () => switchEffort($, to)))}
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
                {pending?.startsWith('effort:') ? (
                  <Text italic dimColor>{pending.slice('effort:'.length)}</Text>
                ) : (
                  <Text bold>{effort}</Text>
                )}
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
