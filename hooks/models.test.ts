import { describe, expect, test } from 'claude-code/testing'

import { hotkeys, isCurrent, labelOf, selectable } from './models'

describe('models', () => {
  test('selectable drops non-models and orders smallest to largest', () => {
    const row = ['default', 'sonnet', 'opus', 'haiku', 'fable', 'best', 'sonnet[1m]', 'opus[1m]', 'opusplan']
    expect(selectable(row)).toEqual(['haiku', 'sonnet', 'opus', 'fable'])
  })

  test('an unknown alias is kept, after the known ones', () => {
    expect(selectable(['zeta', 'opus', 'haiku'])).toEqual(['haiku', 'opus', 'zeta'])
  })

  test('no options means no models', () => {
    expect(selectable(undefined)).toEqual([])
  })

  test('hotkeys are first letters, or digits when asked', () => {
    expect(hotkeys(['haiku', 'sonnet', 'opus', 'fable'], false)).toEqual(['h', 's', 'o', 'f'])
    expect(hotkeys(['haiku', 'sonnet', 'opus', 'fable'], true)).toEqual(['1', '2', '3', '4'])
  })

  test('letters never repeat', () => {
    expect(hotkeys(['sonnet', 'sage'], false)).toEqual(['s', 'a'])
  })

  test('labels and current-model matching', () => {
    expect(labelOf('opus')).toBe('Opus')
    expect(isCurrent('claude-opus-5-5', 'opus')).toBe(true)
    expect(isCurrent('claude-opus-5-5', 'sonnet')).toBe(false)
  })
})
