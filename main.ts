import { log } from 'wechaty'
import { createBot } from './src/bot'
import { startWebServer } from './src/web/server'
import { createStatusHub } from './src/services/status'
import { LOGPRE } from './src/handlers/message'

const status = createStatusHub()

const bot = createBot(status)

// WebUI 与机器人并行启动，WebUI 失败不阻断 bot 运行
const server = startWebServer(status, bot)

bot
  .start()
  .then(() => log.info(LOGPRE, 'started.'))
  .catch(async (e: unknown) => {
    log.error(LOGPRE, `start fail: ${e}`)
    await bot.stop()
    server.close()
    process.exit(1)
  })

// 优雅关闭：SIGINT/Ctrl-C / SIGTERM 时先停 bot 再关 WebUI，保证 SQLite 落盘
function shutdown(signal: string): void {
  log.info(LOGPRE, `received ${signal}, shutting down...`)
  server.close()
  bot
    .stop()
    .catch((e: unknown) => log.error(LOGPRE, `stop fail: ${e}`))
    .finally(() => process.exit(0))
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))