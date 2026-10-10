import { atom, read, update } from 'claude-code'
import type { Color, Register } from 'claude-code'

import type { Limit, Limits } from '../types'

const limits = atom({ plugin: 'usage-bar', key: 'limits' } as const, [] as Limits)
const tick = atom({ plugin: 'usage-bar', key: 'tick' } as const, 0)

const LIMIT_CELLS = 12
const LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: '$' }
const ORDER = ['five_hour', 'seven_day', 'spend_limit']

// ---------- formatting ----------

export function levelColor(percent: number): Color {
  if (percent >= 90) return 'error'
  if (percent >= 70) return 'warning'

  return 'success'
}

function formatLeft(resetsAt: string | undefined, now: number): string | null {
  if (!resetsAt) return null

  const ms = Date.parse(resetsAt) - now
  if (!(ms > 0)) return null

  const minutes = Math.ceil(ms / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${mins}m`

  return `${mins}m`
}

// ---------- meter math ----------

export function meterCells(percent: number): number {
  const clamped = Math.min(100, Math.max(0, percent))

  return Math.round((clamped / 100) * LIMIT_CELLS)
}

export function sortLimits(list: Limits): Limits {
  const rank = (l: Limit) => {
    const i = ORDER.indexOf(l.kind)
    return i === -1 ? ORDER.length : i
  }

  return [...list].sort((a, b) => rank(a) - rank(b))
}

// ---------- hooks ----------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)

    const usage = await $.session.usage()
    await update($, limits, () => usage.rateLimits)

    // Reset countdowns are minute-precise; redraw once a minute.
    $.clock.every(60_000, () => {
      void update($, tick, n => n + 1)
    })

    return result
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await update($, limits, () => e.rateLimits)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const list = sortLimits(await read($, limits))
    if (list.length === 0) return next(e)

    await read($, tick)
    const now = await $.clock.now()

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="row" flexWrap="wrap" columnGap={3}>
        {list.map(limit => {
          const filled = meterCells(limit.percentUsed)
          const left = formatLeft(limit.resetsAt, now)
          const label = LABELS[limit.kind] ?? limit.kind
          const color = levelColor(limit.percentUsed)

          return (
            <Box key={limit.kind} flexDirection="row" gap={1}>
              <Text color="inactive">{label}</Text>
              <Text>
                <Text color={color}>{'━'.repeat(filled)}</Text>
                <Text color="subtle">{'━'.repeat(LIMIT_CELLS - filled)}</Text>
              </Text>
              <Text color={color}>{`${Math.round(limit.percentUsed)}%`}</Text>
              {left && <Text color="inactive">{`· ${left}`}</Text>}
            </Box>
          )
        })}
      </Box>
    )
  })
}
