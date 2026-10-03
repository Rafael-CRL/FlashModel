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

    const before = await $.session.model()
    const target = (e.args ?? '').trim() || models[(models.findIndex(m => before.includes(m)) + 1) % models.length]

    // /model cannot run inside this hook (it would wait on this very command):
    // queue it, then confirm with a toast once the session has switched.
    $.clock.after(0, async () => {
      await $.command.run({ command: 'model', args: target })
      const now = await $.session.model()
      $.ui.toast(now === before ? `Model unchanged: ${now}` : `Model → ${target} (${now})`)
    })
    return {}
  })
}
