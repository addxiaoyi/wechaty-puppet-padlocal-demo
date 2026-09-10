import { log } from 'wechaty'
import type { createBot } from '../bot'
import type { BotController } from '../web/server'
import { botLog } from './observability'

export type BotInstance = ReturnType<typeof createBot>

// 把原始 Wechaty 实例包装成 BotController，暴露 NapCat 式管理能力
// （好友列表 / 群列表 / 群成员 / 主动发消息），供 WebUI 后端调用。
export function createBotController(bot: BotInstance): BotController {
  return {
    logout: () => bot.logout(),
    stop: () => bot.stop(),
    start: () => bot.start(),

    async getContacts() {
      const contacts = await bot.Contact.findAll()
      const rows: Array<{ id: string; name: string; alias: string }> = []
      for (const c of contacts) {
        let alias = ''
        try {
          alias = (await c.alias()) ?? ''
        } catch {
          alias = ''
        }
        rows.push({ id: c.id, name: c.name(), alias })
      }
      // 按备注或昵称排序，让列表更易读
      rows.sort((a, b) => (a.alias || a.name).localeCompare(b.alias || b.name, 'zh'))
      return rows
    },

    async getRooms() {
      const rooms = await bot.Room.findAll()
      const rows: Array<{ id: string; topic: string; memberCount: number }> = []
      for (const r of rooms) {
        let topic = ''
        try {
          topic = await r.topic()
        } catch {
          topic = ''
        }
        let memberCount = 0
        try {
          memberCount = (await r.memberAll()).length
        } catch {
          memberCount = 0
        }
        rows.push({ id: r.id, topic, memberCount })
      }
      rows.sort((a, b) => a.topic.localeCompare(b.topic, 'zh'))
      return rows
    },

    async getRoomMembers(roomId) {
      const room = await bot.Room.find({ id: roomId })
      if (!room) {
        botLog('warn', `getRoomMembers: 未找到群 ${roomId}`)
        return []
      }
      const members = await room.memberAll()
      const rows: Array<{ id: string; name: string; alias: string }> = []
      for (const m of members) {
        let alias = ''
        try {
          alias = (await m.alias()) ?? ''
        } catch {
          alias = ''
        }
        rows.push({ id: m.id, name: m.name(), alias })
      }
      rows.sort((a, b) => (a.alias || a.name).localeCompare(b.alias || b.name, 'zh'))
      return rows
    },

    async sendMessage({ contactId, roomId, text }) {
      try {
        if (roomId) {
          const room = await bot.Room.find({ id: roomId })
          if (!room) return { ok: false, error: `未找到群 ${roomId}` }
          await room.say(text)
          botLog('info', `已群发消息到 ${roomId}`)
        } else if (contactId) {
          const contact = await bot.Contact.find({ id: contactId })
          if (!contact) return { ok: false, error: `未找到联系人 ${contactId}` }
          await contact.say(text)
          botLog('info', `已私聊消息到 ${contactId}`)
        } else {
          return { ok: false, error: '缺少目标（contactId 或 roomId）' }
        }
        return { ok: true }
      } catch (e) {
        log.error('BotController', `sendMessage fail: ${e}`)
        return { ok: false, error: String(e) }
      }
    },
  }
}