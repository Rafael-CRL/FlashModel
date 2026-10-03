import type { Register } from 'claude-code'

// Aliases of the /config Model row that are not a distinct model to land on.
const SKIP = /^(default|best|opusplan)$|\[1m\]$/

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'm',
      description: 'Switch to the next Claude model',
      argumentHint: '[model]',
      immediate: true,
    })
    return next(e)
  })

  on('command.run', { command: 'm' }, async ($, e) => {
    const row = (await $.config.list()).find(r => r.key === 'model')
    const models = (row?.options ?? []).filter(o => !SKIP.test(o))
    if (models.length === 0) return { text: 'FlashModel: no models to cycle through.' }

    const asked = e.args.trim()
    const current = await $.session.model()
    const at = models.findIndex(m => current.includes(m))
    const target = asked || models[(at + 1) % models.length]

    // /model cannot run inside this hook (it would wait on its own turn): queue it.
    $.clock.after(0, async () => {
      await $.command.run({ command: 'model', args: target })
      $.ui.toast(`Model → ${await $.session.model()}`)
    })
    return { text: `Switching to ${target}…` }
  })
}
