import path from 'node:path'
import express from 'express'
import type { Request, Response } from 'express'
import type { Server } from 'http'
import { config } from '../config'
import type { StatusHub } from '../services/status'
import {
  dailyUsage,
  usageSummary,
  allMemories,
  deleteMemory,
  updateMemory,
  deleteMessage,
  deleteRecall,
  deleteConversation,
  memoryStats,
  memoriesByIds,
  recentConversations,
  listConversations,
  usageByContact,
  recentMessageTypes,
  recentRecalls,
} from '../services/storage'
import { addMemoryManually } from '../services/agent'
import { getRuntimeConfig, updateRuntimeConfig, isLlmConfigured } from '../services/runtime-config'
import { systemStats, recentLogs, installLogCapture } from '../services/observability'

// 机器人控制器：仅在完整模式（main.ts）下注入，web:dev 模式下为 undefined
export interface BotController {
  logout(): Promise<unknown>
  stop(): Promise<unknown>
  start(): Promise<unknown>
  // NapCat 式管理能力：联系人 / 群聊 / 主动发消息
  getContacts(): Promise<Array<{ id: string; name: string; alias: string }>>
  getRooms(): Promise<Array<{ id: string; topic: string; memberCount: number }>>
  getRoomMembers(roomId: string): Promise<Array<{ id: string; name: string; alias: string }>>
  sendMessage(target: { contactId?: string; roomId?: string; text: string }): Promise<{ ok: boolean; error?: string }>
}

export function startWebServer(status: StatusHub, bot?: BotController): Server {
  const app = express()
  app.use(express.json())

  // 安装 console 日志镜像，供「运行日志」页实时查看
  installLogCapture()

  // ===== 同源托管个人工作台 =====
  // 按 README 的运行方式（npm start / ts-node / Docker 均从仓库根启动），
  // ui-demo 与仓库根同层，工作台可直接用相对 /api 取数，无跨域问题。
  const uiDir = path.resolve(process.cwd(), 'ui-demo')
  app.use(express.static(uiDir))

  // ===== REST API =====
  // 机器人登录状态（供前端状态条/二维码）
  app.get('/api/bot/status', (_req: Request, res: Response) => {
    res.json(status.getStatus())
  })
  // 用量总览
  app.get('/api/usage/summary', (_req: Request, res: Response) => {
    res.json(usageSummary())
  })

  // 近 N 天用量趋势
  app.get('/api/usage/daily', (req: Request, res: Response) => {
    const days = Number.parseInt(String(req.query.days ?? '7'), 10)
    res.json({ days, data: dailyUsage(Number.isNaN(days) ? 7 : days) })
  })

  // 每用户用量排行（按 token 降序）
  app.get('/api/usage/by-contact', (_req: Request, res: Response) => {
    res.json(usageByContact(20))
  })

  // 最近对话流（跨会话）
  app.get('/api/conversations/recent', (_req: Request, res: Response) => {
    res.json(recentConversations(50))
  })

  // 某段会话完整历史（contactId + 可选 roomId）
  app.get('/api/conversations', (req: Request, res: Response) => {
    const contactId = String(req.query.contactId ?? '')
    const roomId =
      typeof req.query.roomId === 'string' && req.query.roomId
        ? (req.query.roomId as string)
        : null
    res.json(listConversations(contactId, roomId, 20))
  })

  // 记忆列表（可按用户过滤）
  app.get('/api/memories', (req: Request, res: Response) => {
    const contactId = typeof req.query.contactId === 'string' ? req.query.contactId : undefined
    res.json(allMemories(contactId))
  })

  // 删除记忆
  app.delete('/api/memories/:id', (req: Request, res: Response) => {
    const id = Number.parseInt(String(req.params.id), 10)
    if (Number.isNaN(id)) {
      res.status(400).json({ ok: false, error: '非法 id' })
      return
    }
    deleteMemory(id)
    res.json({ ok: true })
  })

  // 新增记忆（含向量化），供「记忆学习」页手动录入
  app.post('/api/memories', async (req: Request, res: Response) => {
    const contactId = typeof req.body?.contactId === 'string' ? req.body.contactId : ''
    const roomId =
      typeof req.body?.roomId === 'string' && req.body.roomId ? req.body.roomId : null
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : ''
    if (!contactId || !content) {
      res.status(400).json({ ok: false, error: '缺少 contactId 或 content' })
      return
    }
    try {
      await addMemoryManually({ contactId, roomId, content })
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) })
    }
  })

  // 更新记忆内容
  app.put('/api/memories/:id', (req: Request, res: Response) => {
    const rawId = req.params.id
    const id = typeof rawId === 'string' && rawId ? Number.parseInt(rawId, 10) : NaN
    if (Number.isNaN(id)) {
      res.status(400).json({ ok: false, error: '无效的记忆 id' })
      return
    }
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : ''
    if (!content) {
      res.status(400).json({ ok: false, error: '缺少 content' })
      return
    }
    try {
      updateMemory(id, content)
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) })
    }
  })

  // 最近收到的消息流（含类型与元信息），供「多类型消息」页展示
  app.get('/api/messages', (req: Request, res: Response) => {
    const limit = Number.parseInt(String(req.query.limit ?? '50'), 10)
    const type = String(req.query.type ?? '')
    const msgs = recentMessageTypes(Number.isNaN(limit) ? 50 : limit)
    res.json(type ? msgs.filter(m => m.type === type) : msgs)
  })

  // 最近向量召回记录，供「向量召回」页展示埋点数据
  app.get('/api/recalls', (req: Request, res: Response) => {
    const limit = Number.parseInt(String(req.query.limit ?? '20'), 10)
    res.json(recentRecalls(Number.isNaN(limit) ? 20 : limit))
  })

  // 按 id 列表取记忆，供「向量召回」页查看命中明细
  app.get('/api/memories-by-ids', (req: Request, res: Response) => {
    const raw = String(req.query.ids ?? '')
    const ids = raw
      .split(',')
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n))
    res.json(memoriesByIds(ids))
  })

  // 记忆统计：总量 / 向量覆盖率 / 每用户聚合，供「记忆管理」页可视化
  app.get('/api/memories/stats', (_req: Request, res: Response) => {
    res.json(memoryStats())
  })

  // 删除消息（审核敏感/误收消息）
  app.delete('/api/messages/:id', (req: Request, res: Response) => {
    const id = Number.parseInt(String(req.params.id), 10)
    if (Number.isNaN(id)) {
      res.status(400).json({ ok: false, error: '非法 id' })
      return
    }
    deleteMessage(id)
    res.json({ ok: true })
  })

  // 删除召回记录
  app.delete('/api/recalls/:id', (req: Request, res: Response) => {
    const id = Number.parseInt(String(req.params.id), 10)
    if (Number.isNaN(id)) {
      res.status(400).json({ ok: false, error: '非法 id' })
      return
    }
    deleteRecall(id)
    res.json({ ok: true })
  })

  // 删除会话消息（审核上下文）
  app.delete('/api/conversations/:id', (req: Request, res: Response) => {
    const id = Number.parseInt(String(req.params.id), 10)
    if (Number.isNaN(id)) {
      res.status(400).json({ ok: false, error: '非法 id' })
      return
    }
    deleteConversation(id)
    res.json({ ok: true })
  })

  // ===== 运行时配置 =====
  // 读取当前生效配置（含 .env 默认 + 在线覆盖），并附带 llmConfigured 标记
  app.get('/api/config', (_req: Request, res: Response) => {
    res.json({ ...getRuntimeConfig(), llmConfigured: isLlmConfigured() })
  })

  // 更新配置（部分字段），做白名单校验后落库，实时生效
  app.put('/api/config', (req: Request, res: Response) => {
    const patch = (req.body ?? {}) as Record<string, unknown>
    try {
      const next = updateRuntimeConfig(patch)
      res.json({ ok: true, config: { ...next, llmConfigured: isLlmConfigured() } })
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) })
    }
  })

  // ===== 机器人控制 =====
  // 登出当前账号（回到扫码状态），需要完整模式的 bot 控制器
  app.post('/api/bot/logout', async (_req: Request, res: Response) => {
    if (!bot) {
      res.status(400).json({ ok: false, error: '当前为 WebUI-only 模式，无机器人实例' })
      return
    }
    try {
      await bot.logout()
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) })
    }
  })

  // 停止机器人（不退出进程）
  app.post('/api/bot/stop', async (_req: Request, res: Response) => {
    if (!bot) {
      res.status(400).json({ ok: false, error: '当前为 WebUI-only 模式，无机器人实例' })
      return
    }
    try {
      await bot.stop()
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) })
    }
  })

  // 启动/重启机器人（停止后再启动）
  app.post('/api/bot/start', async (_req: Request, res: Response) => {
    if (!bot) {
      res.status(400).json({ ok: false, error: '当前为 WebUI-only 模式，无机器人实例' })
      return
    }
    try {
      await bot.start()
      res.json({ ok: true })
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) })
    }
  })

  // ===== 系统资源监控（NapCat 系统信息页）=====
  app.get('/api/system/stats', (_req: Request, res: Response) => {
    res.json(systemStats())
  })

  // ===== 运行日志（NapCat 日志查看页）=====
  app.get('/api/logs', (req: Request, res: Response) => {
    const limit = Number.parseInt(String(req.query.limit ?? '200'), 10)
    res.json(recentLogs(Number.isNaN(limit) ? 200 : limit))
  })

  // ===== 联系人 / 群聊管理（NapCat get_friend_list / get_group_list）=====
  // 好友列表
  app.get('/api/contacts', async (_req: Request, res: Response) => {
    if (!bot) {
      res.status(400).json({ ok: false, error: '当前为 WebUI-only 模式，无机器人实例' })
      return
    }
    try {
      res.json(await bot.getContacts())
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) })
    }
  })

  // 群列表
  app.get('/api/rooms', async (_req: Request, res: Response) => {
    if (!bot) {
      res.status(400).json({ ok: false, error: '当前为 WebUI-only 模式，无机器人实例' })
      return
    }
    try {
      res.json(await bot.getRooms())
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) })
    }
  })

  // 群成员列表
  app.get('/api/rooms/:id/members', async (req: Request, res: Response) => {
    if (!bot) {
      res.status(400).json({ ok: false, error: '当前为 WebUI-only 模式，无机器人实例' })
      return
    }
    try {
      res.json(await bot.getRoomMembers(String(req.params.id)))
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) })
    }
  })

  // 主动发消息（NapCat send_private_msg / send_group_msg）
  app.post('/api/send', async (req: Request, res: Response) => {
    if (!bot) {
      res.status(400).json({ ok: false, error: '当前为 WebUI-only 模式，无机器人实例' })
      return
    }
    const contactId = typeof req.body?.contactId === 'string' ? req.body.contactId : undefined
    const roomId = typeof req.body?.roomId === 'string' ? req.body.roomId : undefined
    const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
    if (text === '' || (!contactId && !roomId)) {
      res.status(400).json({ ok: false, error: '缺少目标（contactId 或 roomId）或消息内容' })
      return
    }
    try {
      res.json(await bot.sendMessage({ contactId, roomId, text }))
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) })
    }
  })

  // 根路径 / 由上方 express.static 托管工作台 index.html
  // 机器人管理不再独立成页：功能已全部并入工作台的「微信机器人」模块（renderBot 走同源 /api）

  const server = app.listen(config.webPort, () => {
    console.log(`[WebUI] 个人工作台已启动: http://localhost:${config.webPort}`)
  })

  return server
}