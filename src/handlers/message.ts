import { log } from 'wechaty'
import type { Message } from 'wechaty'
import * as PUPPET from 'wechaty-puppet'

export const LOGPRE = '[PadLocalDemo]'

export async function handleMessage(message: Message): Promise<void> {
  log.info(LOGPRE, `on message: ${message.toString()}`)

  await logPayload(message)
  await dingDongBot(message)
}

async function logPayload(message: Message): Promise<void> {
  switch (message.type()) {
    case PUPPET.types.Message.Text:
      log.silly(LOGPRE, `get message text: ${message.text()}`)
      break

    case PUPPET.types.Message.Attachment:
    case PUPPET.types.Message.Audio: {
      const attachFile = await message.toFileBox()
      const dataBuffer = await attachFile.toBuffer()
      log.info(LOGPRE, `get message audio or attach: ${dataBuffer.length}`)
      break
    }

    case PUPPET.types.Message.Video: {
      const videoFile = await message.toFileBox()
      const videoData = await videoFile.toBuffer()
      log.info(LOGPRE, `get message video: ${videoData.length}`)
      break
    }

    case PUPPET.types.Message.Emoticon: {
      const emotionFile = await message.toFileBox()
      log.info(LOGPRE, `get message emotion json: ${JSON.stringify(emotionFile.toJSON())}`)

      const emotionBuffer = await emotionFile.toBuffer()
      log.info(LOGPRE, `get message emotion: ${emotionBuffer.length}`)
      break
    }

    case PUPPET.types.Message.Image: {
      const messageImage = await message.toImage()

      const thumbImage = await messageImage.thumbnail()
      const thumbImageData = await thumbImage.toBuffer()
      log.info(LOGPRE, `get message image, thumb: ${thumbImageData.length}`)

      const hdImage = await messageImage.hd()
      const hdImageData = await hdImage.toBuffer()
      log.info(LOGPRE, `get message image, hd: ${hdImageData.length}`)

      const artworkImage = await messageImage.artwork()
      const artworkImageData = await artworkImage.toBuffer()
      log.info(LOGPRE, `get message image, artwork: ${artworkImageData.length}`)
      break
    }

    case PUPPET.types.Message.Url: {
      const urlLink = await message.toUrlLink()
      log.info(LOGPRE, `get message url: ${JSON.stringify(urlLink)}`)

      const urlThumbImage = await message.toFileBox()
      const urlThumbImageData = await urlThumbImage.toBuffer()
      log.info(LOGPRE, `get message url thumb: ${urlThumbImageData.length}`)
      break
    }

    case PUPPET.types.Message.MiniProgram: {
      const miniProgram = await message.toMiniProgram()
      log.info(LOGPRE, `MiniProgramPayload: ${JSON.stringify(miniProgram)}`)
      break
    }
  }
}

async function dingDongBot(message: Message): Promise<void> {
  // 只回应对机器人自己的消息，且文本包含 ding
  if (message.to()?.self() && message.text().includes('ding')) {
    await message.talker().say(message.text().replace('ding', 'dong'))
  }
}