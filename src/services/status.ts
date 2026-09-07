import * as QrCode from 'qrcode'

export type BotState = 'idle' | 'scanning' | 'logged-in' | 'logged-out'

export interface BotStatus {
  state: BotState
  userName: string | null
  // 微信登录二维码（dataURL），扫码阶段有效
  qrcodeUrl: string | null
}

/**
 * 进程内共享的机器人状态中心。
 * bot 通过事件写入状态，WebUI 通过 /api/bot/status 读取。
 */
export function createStatusHub(): {
  setConnected(userName: string): void
  setLoggedOut(): void
  asyncSetScan(qrcode: string): Promise<void>
  getStatus(): BotStatus
} {
  let state: BotState = 'idle'
  let userName: string | null = null
  let qrcodeUrl: string | null = null

  async function asyncSetScan(qrcode: string): Promise<void> {
    // 网络可用时用本地渲染的二维码图片，避免依赖外部 CDN
    try {
      qrcodeUrl = await QrCode.toDataURL(
        ['https://wechaty.js.org/qrcode/', encodeURIComponent(qrcode)].join(''),
        { width: 260 }
      )
    } catch {
      qrcodeUrl = null
    }
    state = 'scanning'
    userName = null
  }

  return {
    setConnected(name): void {
      state = 'logged-in'
      userName = name
      qrcodeUrl = null
    },
    setLoggedOut(): void {
      state = 'logged-out'
      userName = null
      qrcodeUrl = null
    },
    asyncSetScan,
    getStatus(): BotStatus {
      return { state, userName, qrcodeUrl }
    },
  }
}

export type StatusHub = ReturnType<typeof createStatusHub>