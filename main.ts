import { log } from 'wechaty'
import { createBot } from './src/bot'
import { LOGPRE } from './src/handlers/message'

const bot = createBot()

bot
  .start()
  .then(() => log.info(LOGPRE, 'started.'))
  .catch(async (e: unknown) => {
    log.error(LOGPRE, `start fail: ${e}`)
    await bot.stop()
    process.exit(1)
  })