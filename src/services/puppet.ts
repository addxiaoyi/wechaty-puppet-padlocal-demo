import { config } from '../config'
import type { Puppet } from 'wechaty-puppet'

// 按需加载通道实现：只 require 实际用到的那个，避免脑裂式加载两个协议
function createPuppet(): Puppet {
  switch (config.provider) {
    case 'padlocal': {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { PuppetPadlocal } = require('wechaty-puppet-padlocal')
      return new PuppetPadlocal({ token: config.padlocalToken })
    }

    case 'service': {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { PuppetService } = require('wechaty-puppet-service')
      return new PuppetService({
        token: config.serviceToken,
        ...(config.serviceEndpoint ? { endpoint: config.serviceEndpoint } : {}),
      })
    }

    default:
      throw new Error(`未实现的 puppet 通道: ${config.provider}`)
  }
}

export const puppet = createPuppet()