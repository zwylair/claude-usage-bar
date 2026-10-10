import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { levelColor, meterCells, sortLimits } from '../hooks/register'

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
}

test('meter math clamps and rounds', async () => {
  expect(meterCells(0)).toBe(0)
  expect(meterCells(50)).toBe(6)
  expect(meterCells(140)).toBe(12)
})

test('green below 70%, yellow below 90%, red from there', async () => {
  expect(levelColor(0)).toBe('success')
  expect(levelColor(69.9)).toBe('success')
  expect(levelColor(70)).toBe('warning')
  expect(levelColor(89.9)).toBe('warning')
  expect(levelColor(90)).toBe('error')
  expect(levelColor(140)).toBe('error')
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
    expect(await ui.find({ type: 'Text', text: /^ctx$/ })).toBeUndefined()

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
