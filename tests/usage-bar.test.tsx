import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { formatTokens, meterCells, sliceCells, sortLimits } from '../hooks/register'

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const NOW = Date.parse('2026-10-11T00:00:00Z')

// What sits beneath the plugin in a session: the engine's own empty band
// and its echo of a measurement.
function engineBottom(on: On) {
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('clock.now', () => ({ value: NOW }))

  on('session.usage', () => ({
    value: {
      startedAt: NOW,
      rateLimits: [],
      context: {
        window: 200_000,
        tokens: 82_000,
        percent: 41,
        breakdown: {
          categories: [
            { name: 'System prompt', tokens: 3_100, color: 'promptBorder', isDeferred: false, kind: 'used' },
            { name: 'Messages', tokens: 78_900, color: 'permission', isDeferred: false, kind: 'used' },
            { name: 'Free space', tokens: 118_000, color: 'inactive', isDeferred: false, kind: 'free' },
          ],
          totalTokens: 82_000,
          maxTokens: 200_000,
          rawMaxTokens: 200_000,
          percentage: 41,
        },
      },
    },
  }) as never)
}

test('meter math clamps and rounds', async () => {
  expect(meterCells(0)).toBe(0)
  expect(meterCells(50)).toBe(6)
  expect(meterCells(140)).toBe(12)
})

test('5h comes before 7d', async () => {
  const sorted = sortLimits([
    { kind: 'seven_day', percentUsed: 1 },
    { kind: 'five_hour', percentUsed: 2 },
  ])

  expect(sorted.map(l => l.kind)).toEqual(['five_hour', 'seven_day'])
})

test('band shows both windows after a measurement, on every surface', async ($, on) => {
  engineBottom(on)

  await $.session.measure({
    context: { contextWindow: 200_000 },
    rateLimits: [
      { kind: 'seven_day', percentUsed: 18.4 },
      { kind: 'five_hour', percentUsed: 62, resetsAt: '2026-10-11T02:14:00Z' },
    ],
    changed: ['rateLimits'],
  } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-bar', surface, ...BAND })

    expect(await ui.find({ type: 'Text', text: /^5h$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^62%$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^18%$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^· 2h 14m$/ })).toBeDefined()

    await ui.unmount()
  }
})

test('band stays out of the way with no readings', async ($, on) => {
  engineBottom(on)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-bar', surface, ...BAND })

    expect(await ui.find({ type: 'Text', text: /%$/ })).toBeUndefined()

    await ui.unmount()
  }
})

test('context cells keep small slices visible and fit the bar', async () => {
  const cells = sliceCells(
    [
      { name: 'a', tokens: 500, color: 'x' },
      { name: 'b', tokens: 100_000, color: 'y' },
    ],
    200_000,
    24,
  )

  expect(cells).toEqual([1, 11])
  expect(sliceCells([{ name: 'a', tokens: 400_000, color: 'x' }], 200_000, 24)).toEqual([24])
  expect(formatTokens(82_400)).toBe('82.4k')
})

test('context row shows the fill and its categories, on every surface', async ($, on) => {
  engineBottom(on)

  await $.session.measure({
    context: { window: 200_000, tokens: 82_000, percent: 41 },
    rateLimits: [],
    changed: ['context'],
  } as never)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'usage-bar', surface, ...BAND })

    expect(await ui.find({ type: 'Text', text: /^41%$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^· 82k \/ 200k$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Messages$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Free space$/ })).toBeUndefined()

    await ui.unmount()
  }
})
