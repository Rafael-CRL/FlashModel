// Aliases of the /config Model row that are not a distinct model to land on.
const SKIP = /^(default|best|opusplan)$|\[1m\]$/

// Smallest to largest; anything else keeps the engine's order after these.
const SIZE = ['haiku', 'sonnet', 'opus', 'fable']

const rank = (m: string) => (SIZE.includes(m) ? SIZE.indexOf(m) : SIZE.length)

/** The models the selector offers and /m cycles through, from the Model row's options. */
export const selectable = (options: readonly string[] = []): string[] =>
  options.filter(o => !SKIP.test(o)).sort((a, b) => rank(a) - rank(b))

export const labelOf = (m: string) => m.charAt(0).toUpperCase() + m.slice(1)

/** Whether a resolved model id (`claude-opus-5-5`) is this alias. */
export const isCurrent = (id: string, m: string) => id.includes(m)

/** One hotkey per model: the number keys, or the first free letter of its name. */
export const hotkeys = (models: readonly string[], isNumbered: boolean): string[] => {
  const taken = new Set<string>()
  return models.map((m, i) => {
    if (isNumbered) return String(i + 1)
    const key = [...m.toLowerCase()].find(c => /[a-z]/.test(c) && !taken.has(c)) ?? ''
    taken.add(key)
    return key
  })
}
