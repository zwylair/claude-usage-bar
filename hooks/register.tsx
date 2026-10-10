import { atom, read, update } from 'claude-code'
import type { Color, EngineInterface, Register } from 'claude-code'

import type { ContextFill, ContextSlice, Limit, Limits } from '../types'

const limits = atom({ plugin: 'usage-bar', key: 'limits' } as const, [] as Limits)
const context = atom({ plugin: 'usage-bar', key: 'context' } as const, null as ContextFill | null)
const tick = atom({ plugin: 'usage-bar', key: 'tick' } as const, 0)

const LIMIT_CELLS = 12
const CONTEXT_CELLS = 24
const LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d', spend_limit: '$' }
const ORDER = ['five_hour', 'seven_day', 'spend_limit']

// ---------- formatting ----------

function levelColor(percent: number): Color {
  if (percent >= 90) return 'error'
  if (percent >= 75) return 'warning'

  return 'claude'
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

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}k`

  return `${Math.round(n)}`
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

/**
 * Splits `cells` between slices in proportion to their tokens against `max`
 * (largest remainder). A non-empty slice gets at least one cell while room is
 * left, so a small category never vanishes from the bar.
 */
export function sliceCells(slices: ContextSlice[], max: number, cells: number): number[] {
  if (max <= 0) return slices.map(() => 0)

  const exact = slices.map(s => (s.tokens / max) * cells)
  const used = Math.min(cells, Math.round(exact.reduce((a, b) => a + b, 0)))
  const out = exact.map(x => Math.floor(x))

  out.forEach((n, i) => {
    if (n === 0 && slices[i]!.tokens > 0) out[i] = 1
  })

  let total = out.reduce((a, b) => a + b, 0)
  const byRemainder = exact
    .map((x, i) => ({ i, r: x - Math.floor(x) }))
    .sort((a, b) => b.r - a.r)

  for (const { i } of byRemainder) {
    if (total >= used) break
    out[i]! += 1
    total += 1
  }

  while (total > used) {
    const biggest = out.indexOf(Math.max(...out))
    out[biggest]! -= 1
    total -= 1
  }

  return out
}

// ---------- data ----------

async function readContext($: EngineInterface): Promise<ContextFill | null> {
  const usage = await $.session.usage({ breakdown: 'summary' })
  const breakdown = usage.context.breakdown
  if (!breakdown) return null

  const slices = breakdown.categories
    .filter(c => c.kind === 'used' && c.tokens > 0)
    .map(c => ({ name: c.name, tokens: c.tokens, color: c.color }))

  return {
    slices,
    usedTokens: breakdown.totalTokens,
    maxTokens: breakdown.rawMaxTokens,
    percent: breakdown.percentage,
  }
}

// ---------- hooks ----------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)

    const usage = await $.session.usage()
    await update($, limits, () => usage.rateLimits)
    const fill = await readContext($)
    await update($, context, () => fill)

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

    if (e.changed.includes('context')) {
      const fill = await readContext($)
      await update($, context, () => fill)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const list = sortLimits(await read($, limits))
    const fill = await read($, context)
    if (list.length === 0 && !fill) return next(e)

    await read($, tick)
    const now = await $.clock.now()

    const { Box, Text } = $.ui.resolve(e)

    const limitRow = list.length > 0 && (
      <Box key="limits" flexDirection="row" flexWrap="wrap" columnGap={3}>
        {list.map(limit => {
          const filled = meterCells(limit.percentUsed)
          const left = formatLeft(limit.resetsAt, now)
          const label = LABELS[limit.kind] ?? limit.kind

          return (
            <Box key={limit.kind} flexDirection="row" gap={1}>
              <Text color="inactive">{label}</Text>
              <Text>
                <Text color={levelColor(limit.percentUsed)}>{'━'.repeat(filled)}</Text>
                <Text color="subtle">{'━'.repeat(LIMIT_CELLS - filled)}</Text>
              </Text>
              <Text color="text">{`${Math.round(limit.percentUsed)}%`}</Text>
              {left && <Text color="inactive">{`· ${left}`}</Text>}
            </Box>
          )
        })}
      </Box>
    )

    let contextRow = null

    if (fill) {
      const cells = sliceCells(fill.slices, fill.maxTokens, CONTEXT_CELLS)
      const free = Math.max(0, CONTEXT_CELLS - cells.reduce((a, b) => a + b, 0))

      contextRow = (
        <Box key="context" flexDirection="row" flexWrap="wrap" columnGap={3}>
          <Box key="ctx-meter" flexDirection="row" gap={1}>
            <Text color="inactive">ctx</Text>
            <Text>
              {fill.slices.map((s, i) => (
                <Text color={s.color}>{'━'.repeat(cells[i] ?? 0)}</Text>
              ))}
              <Text color="subtle">{'━'.repeat(free)}</Text>
            </Text>
            <Text color={levelColor(fill.percent)}>{`${Math.round(fill.percent)}%`}</Text>
            <Text color="inactive">
              {`· ${formatTokens(fill.usedTokens)} / ${formatTokens(fill.maxTokens)}`}
            </Text>
          </Box>

          <Box key="ctx-legend" flexDirection="row" flexWrap="wrap" columnGap={2}>
            {fill.slices.map(s => (
              <Box key={`ctx-${s.name}`} flexDirection="row" gap={1}>
                <Text color={s.color}>●</Text>
                <Text color="inactive">{s.name}</Text>
                <Text color="text">{formatTokens(s.tokens)}</Text>
              </Box>
            ))}
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        {limitRow}
        {contextRow}
      </Box>
    )
  })
}
