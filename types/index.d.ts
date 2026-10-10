export type Limit = { kind: string; percentUsed: number; resetsAt?: string }
export type Limits = Limit[]

export type ContextSlice = { name: string; tokens: number; color: string }

export type ContextFill = {
  slices: ContextSlice[]
  usedTokens: number
  maxTokens: number
  percent: number
}

declare module 'claude-code' {
  interface PluginState {
    'usage-bar': { limits: Limits; context: ContextFill | null; tick: number }
  }
}
