// 仅启动 WebUI + API 服务，不拉起 wechaty 机器人。
// 用于前端联调与 E2E 测试，避免依赖真实扫码登录。
import { createStatusHub } from '../services/status'
import { startWebServer } from './server'
import { config } from '../config'

const status = createStatusHub()
startWebServer(status)

console.log(`[webui] 服务已启动 http://localhost:${config.webPort}`)
console.log('[webui] 未启动机器人，如需登录请运行 npm run demo')