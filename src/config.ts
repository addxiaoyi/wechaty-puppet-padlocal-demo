import { config as loadEnv } from 'dotenv'

loadEnv()

export type PuppetProvider = 'padlocal' | 'service'

export interface AppConfig {
  name: string
  provider: PuppetProvider
  padlocalToken: string
  serviceToken: string
  serviceEndpoint: string
  apiBaseUrl: string
}

const PROVIDERS: PuppetProvider[] = ['padlocal', 'service']

function b(name: string) {
  return (process.env[name] ?? '').trim()
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

  return {
    name: b('WECHATY_NAME') || 'PadLocalDemo',
    provider,
    padlocalToken,
    serviceToken,
    serviceEndpoint: b('WECHATY_PUPPET_SERVICE_ENDPOINT'),
    apiBaseUrl: b('API_BASE_URL'),
  }
})()