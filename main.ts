import { log } from 'wechaty'
import { createBot } from './src/bot'
import { startWebServer } from './src/web/server'
import { LOGPRE } from './src/handlers/message'

const bot = createBot()

// WebUI 与机器人并行启动，WebUI 失败不阻断 bot 运行
startWebServer()

bot
  .start()
  .then(() => log.info(LOGPRE, 'started.'))
  .catch(async (e: unknown) => {
    log.error(LOGPRE, `start fail: ${e}`)
    await bot.stop()
    process.exit(1)
  })