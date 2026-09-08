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
  memoriesByIds,
  recentConversations,
  listConversations,
  usageByContact,
  recentMessageTypes,
  recentRecalls,
} from '../services/storage'
import { addMemoryManually } from '../services/agent'

export function startWebServer(status: StatusHub): Server {
  const app = express()
  app.use(express.json())

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

  // 根路径 / 由上方 express.static 托管工作台 index.html
  // 机器人管理不再独立成页：功能已全部并入工作台的「微信机器人」模块（renderBot 走同源 /api）

  const server = app.listen(config.webPort, () => {
    console.log(`[WebUI] 个人工作台已启动: http://localhost:${config.webPort}`)
  })

  return server
}