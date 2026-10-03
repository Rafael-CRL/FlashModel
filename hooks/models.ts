// Aliases of the /config Model row that are not a distinct model to land on, and
// Fable, which bills usage credits and needs a one-time consent (`/m fable` still works).
const SKIP = /^(default|best|opusplan|fable)$|\[1m\]$/

// Smallest to largest; anything else keeps the engine's order after these.
const SIZE = ['haiku', 'sonnet', 'opus']

const rank = (m: string) => (SIZE.includes(m) ? SIZE.indexOf(m) : SIZE.length)

/** The models the band offers and /m cycles through, from the Model row's options. */
export const selectable = (options: readonly string[] = []): string[] =>
  options.filter(o => !SKIP.test(o)).sort((a, b) => rank(a) - rank(b))

export const labelOf = (m: string) => m.charAt(0).toUpperCase() + m.slice(1)

/** Whether a resolved model id (`claude-opus-5-5`) is this alias. */
export const isCurrent = (id: string, m: string) => id.includes(m)

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

export const isEffort = (value: unknown): value is Effort => EFFORTS.includes(value as Effort)

/** The levels a resolved model id takes, per Claude Code's model docs; none for Haiku. */
export const effortsOf = (id: string): Effort[] =>
  /(fable|opus|sonnet)-5|opus-4-[78]/.test(id)
    ? [...EFFORTS]
    : /(opus|sonnet)-4-6/.test(id)
      ? EFFORTS.filter(level => level !== 'xhigh')
      : []

/** The level a model runs at when nothing sets one. */
export const defaultEffort = (id: string): Effort =>
  /(opus|sonnet)-5-5/.test(id) ? 'medium' : /opus-4-7/.test(id) ? 'xhigh' : 'high'
