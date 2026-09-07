import { log } from 'wechaty'
import type { Message } from 'wechaty'
import * as PUPPET from 'wechaty-puppet'
import { askAgent } from '../services/agent'

export const LOGPRE = '[PadLocalDemo]'

export async function handleMessage(message: Message): Promise<void> {
  log.info(LOGPRE, `on message: ${message.toString()}`)

  await logPayload(message)
  await reply(message)
}

// 私聊直接回复；群聊仅在 @机器人 时回复
async function reply(message: Message): Promise<void> {
  if (message.type() !== PUPPET.types.Message.Text) {
    return
  }

  const roomId = message.room()?.id ?? null
  const talker = message.talker()

  // 自己发的消息不回复
  if (message.self()) {
    return
  }
  // 群聊：仅在 @机器人 时回复，避免刷屏
  if (roomId && !(await message.mentionSelf())) {
    return
  }

  const answer = await askAgent({
    contactId: talker.id,
    roomId,
    text: message.text(),
  })

  if (answer && !message.self()) {
    await message.say(answer)
  }
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