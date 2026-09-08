import { log } from 'wechaty'
import type { Message } from 'wechaty'
import * as PUPPET from 'wechaty-puppet'
import { askAgent } from '../services/agent'
import { addMessageRecord } from '../services/storage'

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
  // 落库消息类型与元信息，供 WebUI「多类型消息」页展示真实消息流
  const roomId = message.room()?.id ?? null
  const talkerId = message.talker().id
  const typeLabel = typeLabelOf(message.type())
  if (typeLabel) {
    addMessageRecord({
      contactId: talkerId,
      roomId,
      type: typeLabel,
      meta: await typeMeta(message),
    })
  }

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

// 归一化微信消息类型为中文可读标签；未知类型返回 null（不落库）
function typeLabelOf(type: PUPPET.types.Message): string | null {
  switch (type) {
    case PUPPET.types.Message.Text: return '文本'
    case PUPPET.types.Message.Image: return '图片'
    case PUPPET.types.Message.Audio: return '语音'
    case PUPPET.types.Message.Video: return '视频'
    case PUPPET.types.Message.Emoticon: return '表情'
    case PUPPET.types.Message.Url: return '链接'
    case PUPPET.types.Message.MiniProgram: return '小程序'
    case PUPPET.types.Message.Attachment: return '文件'
    default: return null
  }
}

// 提取消息元信息（文本内容 / 链接地址 / 小程序标题等），失败时可空，不阻塞落库
async function typeMeta(message: Message): Promise<Record<string, unknown> | null> {
  try {
    switch (message.type()) {
      case PUPPET.types.Message.Text:
        return { text: message.text() }
      case PUPPET.types.Message.Url:
        return { url: (await message.toUrlLink()).url }
      case PUPPET.types.Message.MiniProgram: {
        const mp = await message.toMiniProgram()
        return { title: mp.title, appid: mp.appid }
      }
      default:
        return null
    }
  } catch {
    return null
  }
}