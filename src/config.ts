import { config as loadEnv } from 'dotenv'

loadEnv()

export type PuppetProvider = 'padlocal' | 'service'

export interface LlmConfig {
  apiBase: string
  apiKey: string
  model: string
  systemPrompt: string
}

export interface AppConfig {
  name: string
  provider: PuppetProvider
  padlocalToken: string
  serviceToken: string
  serviceEndpoint: string
  apiBaseUrl: string
  webPort: number
  dbPath: string
  llm: LlmConfig | null
}

const PROVIDERS: PuppetProvider[] = ['padlocal', 'service']

function b(name: string) {
  return (process.env[name] ?? '').trim()
}

// 解析端口与环境变量数字，非法时回退默认值
function num(name: string, fallback: number): number {
  const n = Number.parseInt(b(name), 10)
  return Number.isNaN(n) ? fallback : n
}

// 在进程启动时立即校验配置，缺 key 直接抛错，避免运行中偶发无效状态
export const config: AppConfig = (() => {
  const provider = b('WECHATY_PUPPET_PROVIDER') as PuppetProvider

  if (!PROVIDERS.includes(provider)) {
    throw new Error(
      `无效的 WECHATY_PUPPET_PROVIDER=${provider}，可选值: ${PROVIDERS.join(' | ')}`
    )
  }

  const padlocalToken = b('WECHATY_PUPPET_PADLOCAL_TOKEN')
  const serviceToken = b('WECHATY_PUPPET_SERVICE_TOKEN')

  if (provider === 'padlocal' && !padlocalToken) {
    throw new Error('使用 padlocal 通道时必须设置 WECHATY_PUPPET_PADLOCAL_TOKEN')
  }
  if (provider === 'service' && !serviceToken) {
    throw new Error('使用 service 通道时必须设置 WECHATY_PUPPET_SERVICE_TOKEN')
  }

  // LLM 需同时配置 base 与 key 才启用；缺任一则机器人回退为纯规则回复
  const llmApiBase = b('LLM_API_BASE')
  const llmApiKey = b('LLM_API_KEY')

  const llm =
    llmApiBase && llmApiKey
      ? {
          apiBase: llmApiBase,
          apiKey: llmApiKey,
          model: b('LLM_MODEL') || 'gpt-4o-mini',
          systemPrompt:
            b('LLM_SYSTEM_PROMPT') ||
            `你是「${b('WECHATY_NAME') || 'PadLocalDemo'}」机器人，用简洁、口语化的中文回复微信消息。`,
        }
      : null

  return {
    name: b('WECHATY_NAME') || 'PadLocalDemo',
    provider,
    padlocalToken,
    serviceToken,
    serviceEndpoint: b('WECHATY_PUPPET_SERVICE_ENDPOINT'),
    apiBaseUrl: b('API_BASE_URL'),
    webPort: num('WEB_PORT', 8765),
    dbPath: b('DB_PATH') || 'bot-data/bot.db',
    llm,
  }
})()