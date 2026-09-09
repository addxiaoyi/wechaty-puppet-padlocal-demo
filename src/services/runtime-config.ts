import { config } from '../config'
import { loadRuntimeConfig, saveRuntimeConfig } from './storage'

// 可在线调整的运行时配置项。值优先取 DB 覆盖，缺省回退 .env 默认。
export interface RuntimeConfig {
  systemPrompt: string
  model: string
  embeddingModel: string
  // 响应开关：false 时机器人收到消息仅落库不回复
  autoReply: boolean
  // 私聊是否自动回复
  replyPrivate: boolean
  // 群聊是否在 @机器人 时回复
  replyGroup: boolean
  // 注入相似记忆的最大条数
  memoryTopK: number
}

// 配置项 -> 默认值（来自启动时的 .env / 硬编码兜底）
function defaults(): RuntimeConfig {
  const llmCfg = config.llm
  return {
    systemPrompt:
      llmCfg?.systemPrompt ??
      `你是「${config.name}」机器人，用简洁、口语化的中文回复微信消息。`,
    model: llmCfg?.model ?? 'gpt-4o-mini',
    embeddingModel: llmCfg?.embeddingModel ?? 'text-embedding-3-small',
    autoReply: true,
    replyPrivate: true,
    replyGroup: true,
    memoryTopK: 3,
  }
}

// 布尔项：DB 存 "0"/"1"
const BOOL_KEYS = ['autoReply', 'replyPrivate', 'replyGroup'] as const
// 数字项
const NUM_KEYS = ['memoryTopK'] as const

function asNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isNaN(n) ? fallback : n
}

function asBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback
  return raw === '1' || raw === 'true'
}

// 读取运行时配置：合并 .env 默认值与 DB 覆盖，并做类型归一化
export function getRuntimeConfig(): RuntimeConfig {
  const base = defaults()
  const overrides = loadRuntimeConfig()

  const out = { ...base } as RuntimeConfig
  for (const k of BOOL_KEYS) {
    out[k] = asBool(overrides[k], base[k])
  }
  for (const k of NUM_KEYS) {
    out[k] = asNumber(overrides[k], base[k])
  }
  if (overrides.systemPrompt) out.systemPrompt = overrides.systemPrompt
  if (overrides.model) out.model = overrides.model
  if (overrides.embeddingModel) out.embeddingModel = overrides.embeddingModel

  return out
}

// 接收前端提交的部分配置，做类型校验后落库。返回归一化后的完整配置。
// 仅接受白名单内且类型合法的值，非法值静默忽略，避免落脏数据。
export function updateRuntimeConfig(patch: Record<string, unknown>): RuntimeConfig {
  const base = defaults()
  const normalized: Record<string, string> = {}

  if (typeof patch.systemPrompt === 'string' && patch.systemPrompt.trim()) {
    normalized.systemPrompt = patch.systemPrompt.trim()
  }
  if (typeof patch.model === 'string' && patch.model.trim()) {
    normalized.model = patch.model.trim()
  }
  if (typeof patch.embeddingModel === 'string' && patch.embeddingModel.trim()) {
    normalized.embeddingModel = patch.embeddingModel.trim()
  }
  for (const k of BOOL_KEYS) {
    if (typeof patch[k] === 'boolean') normalized[k as string] = patch[k] ? '1' : '0'
  }
  if (typeof patch.memoryTopK === 'number' && Number.isInteger(patch.memoryTopK)) {
    const v = Math.max(1, Math.min(patch.memoryTopK, 20))
    normalized.memoryTopK = String(v)
  }

  if (Object.keys(normalized).length > 0) {
    saveRuntimeConfig(normalized)
  }

  // memoryTopK 未提交时回退现有值，避免被 base 覆盖
  void base
  return getRuntimeConfig()
}

// 是否已配置 LLM（web:dev 模式下可能未配置，前端据此提示）
export function isLlmConfigured(): boolean {
  return config.llm !== null
}