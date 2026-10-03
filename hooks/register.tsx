import type { EngineInterface, Register } from 'claude-code'

import { hotkeys, isCurrent, labelOf, selectable } from './models'

const modelRow = async ($: EngineInterface) =>
  selectable((await $.config.list()).find(r => r.key === 'model')?.options)

// Models /model refused this session (no access, or a one-time consent pending).
const refused = new Set<string>()

// Runs /model for each target until the session's model changes; true if it did.
// Never inside a command hook: /model waits on the turn, so a command queues it.
async function switchTo($: EngineInterface, targets: string[], isCycle: boolean) {
  const before = await $.session.model()
  for (const target of targets.filter(m => !isCycle || !refused.has(m))) {
    await $.command.run({ command: 'model', args: target })
    const now = await $.session.model()
    if (now !== before) {
      $.ui.toast(`Model → ${target} (${now})`)
      $.ui.invalidate('ui.render')
      return true
    }
    if (isCycle) refused.add(target)
  }
  $.ui.toast(`Model unchanged: ${before}`)
  return false
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'm',
      description: 'Switch to the next Claude model',
      argumentHint: '[model]',
      immediate: true,
    })
    return next(e)
  })

  // Any route that changes the model (the band, /m, /model, the picker) redraws the band.
  on('classic.PostModelSwitch', async ($, e, next) => {
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('command.run', { command: 'm' }, async ($, e) => {
    const models = await modelRow($)
    if (models.length === 0) return { text: 'FlashModel: no models to cycle through.' }

    const before = await $.session.model()
    const asked = (e.args ?? '').trim()
    const from = models.findIndex(m => isCurrent(before, m))
    const queue = asked ? [asked] : models.map((_, i) => models[(from + 1 + i) % models.length])

    $.clock.after(0, () => switchTo($, queue, !asked))
    return {}
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const models = await modelRow($)
    if (e.props.hasSurvey || models.length < 2) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const current = await $.session.model()
    const keys = hotkeys(models, options.digitHotkeys === true)

    return (
      <Box columnGap={2}>
        <Text dimColor>Model</Text>
        {models.map((m, i) => {
          const isActive = isCurrent(current, m)
          return (
            <Button
              key={m}
              plain
              hotkey={keys[i] || undefined}
              dimColor={!isActive}
              label={`${isActive ? '● ' : ''}${labelOf(m)}`}
              onPress={() => (isActive ? undefined : switchTo($, [m], false))}
            />
          )
        })}
      </Box>
    )
  })
}
