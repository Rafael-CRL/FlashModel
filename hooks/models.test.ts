import { describe, expect, test } from 'claude-code/testing'

import { defaultEffort, effortsOf, fitEffort, isCurrent, labelOf, selectable } from './models'

describe('models', () => {
  test('selectable drops Fable and non-models, smallest to largest', () => {
    const row = ['default', 'sonnet', 'opus', 'haiku', 'fable', 'best', 'sonnet[1m]', 'opus[1m]', 'opusplan']
    expect(selectable(row)).toEqual(['haiku', 'sonnet', 'opus'])
  })

  test('an unknown alias is kept, after the known ones', () => {
    expect(selectable(['zeta', 'opus', 'haiku'])).toEqual(['haiku', 'opus', 'zeta'])
  })

  test('no options means no models', () => {
    expect(selectable(undefined)).toEqual([])
  })

  test('labels and current-model matching', () => {
    expect(labelOf('opus')).toBe('Opus')
    expect(isCurrent('claude-opus-5-5', 'opus')).toBe(true)
    expect(isCurrent('claude-opus-5-5', 'sonnet')).toBe(false)
  })
})

describe('effort', () => {
  test('levels follow the model', () => {
    expect(effortsOf('claude-opus-5-5')).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
    expect(effortsOf('claude-sonnet-4-6')).toEqual(['low', 'medium', 'high', 'max'])
    expect(effortsOf('claude-haiku-4-5-20251001')).toEqual([])
    expect(effortsOf('claude-sonnet-4-5')).toEqual([])
  })

  test('defaults follow the model', () => {
    expect(defaultEffort('claude-opus-5-5')).toBe('medium')
    expect(defaultEffort('claude-sonnet-5-5')).toBe('medium')
    expect(defaultEffort('claude-opus-4-7')).toBe('xhigh')
    expect(defaultEffort('claude-fable-5-1')).toBe('high')
  })

  test('a level a model does not take falls to the nearest one below', () => {
    expect(fitEffort('xhigh', 'claude-sonnet-4-6')).toBe('high')
    expect(fitEffort('max', 'claude-sonnet-4-6')).toBe('max')
    expect(fitEffort('xhigh', 'claude-opus-5-5')).toBe('xhigh')
  })
})
