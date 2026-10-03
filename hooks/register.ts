import type { Register } from 'claude-code'

// Aliases of the /config Model row that are not a distinct model to land on.
const SKIP = /^(default|best|opusplan)$|\[1m\]$/

export const register: Register = on => {
  // Models /model refused this session (no access, or a one-time consent pending).
  const refused = new Set<string>()

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
    const asked = (e.args ?? '').trim()
    const from = models.findIndex(m => before.includes(m))
    const queue = asked ? [asked] : models.map((_, i) => models[(from + 1 + i) % models.length])

    // /model cannot run inside this hook (it would wait on this very command):
    // queue it, then confirm with a toast once the session has switched.
    $.clock.after(0, async () => {
      for (const target of queue.filter(m => asked || !refused.has(m))) {
        await $.command.run({ command: 'model', args: target })
        const now = await $.session.model()
        if (now !== before) return $.ui.toast(`Model → ${target} (${now})`)
        refused.add(target)
      }
      $.ui.toast(`Model unchanged: ${before}`)
    })
    return {}
  })
}
