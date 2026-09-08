import { describe, it, expect, afterAll, beforeEach, vi } from 'vitest'
import { rmSync } from 'node:fs'
import Database from 'better-sqlite3'

// vi.hoisted 的代码会被提升到所有 import 之前执行：
// storage.ts 在模块顶层读取 config.dbPath 并建库，必须先改写 DB_PATH，
// 否则 dotenv 会读到 .env 里的 bot-data/bot.db，测试将清空真实开发库
const { tmpDir, db } = await vi.hoisted(async () => {
  const { mkdtempSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = mkdtempSync(join(tmpdir(), 'bot-storage-test-'))
  process.env.WECHATY_PUPPET_PROVIDER = 'padlocal'
  process.env.WECHATY_PUPPET_PADLOCAL_TOKEN = 'test-token'
  process.env.DB_PATH = join(dir, 'test.db')
  const BetterSqlite3 = (await import('better-sqlite3')).default
  // 与 storage.ts 各持一个到同一文件的连接，WAL 模式下互不阻塞
  return { tmpDir: dir, db: new BetterSqlite3(join(dir, 'test.db')) }
})

import {
  addMessage,
  recentMessages,
  listConversations,
  recentConversations,
  addUsage,
  dailyUsage,
  usageSummary,
  usageByContact,
  addMemory,
  listMemoryRows,
  listMemories,
  allMemories,
  deleteMemory,
  addMessageRecord,
  recentMessageTypes,
  addRecall,
  recentRecalls,
  closeDb,
} from './storage'

describe('Storage: conversations', () => {
  beforeEach(() => {
    db.exec('DELETE FROM conversations; DELETE FROM usage_log; DELETE FROM memories;')
  })

  it('写入并按时间正序读取私聊会话', () => {
    addMessage('alice', null, { role: 'user', content: 'hi' })
    addMessage('alice', null, { role: 'assistant', content: 'hello' })

    const msgs = recentMessages('alice', null, 10)
    expect(msgs).toHaveLength(2)
    expect(msgs[0].content).toBe('hi')
    expect(msgs[1].content).toBe('hello')
  })

  it('按 limit 截断会话历史', () => {
    for (let i = 0; i < 5; i++) {
      addMessage('bob', null, { role: 'user', content: `msg-${i}` })
    }
    const msgs = recentMessages('bob', null, 3)
    expect(msgs).toHaveLength(3)
    // LIMIT 倒序取末尾插入的 3 条，再 reverse 成正序
    expect(msgs[0].content).toBe('msg-2')
    expect(msgs[2].content).toBe('msg-4')
  })

  it('私聊与群聊通过 roomId 隔离', () => {
    addMessage('carol', null, { role: 'user', content: 'private-msg' })
    addMessage('carol', 'room-1', { role: 'user', content: 'group-msg' })

    const privateMsgs = recentMessages('carol', null, 10)
    const groupMsgs = recentMessages('carol', 'room-1', 10)

    expect(privateMsgs).toHaveLength(1)
    expect(privateMsgs[0].content).toBe('private-msg')
    expect(groupMsgs).toHaveLength(1)
    expect(groupMsgs[0].content).toBe('group-msg')
  })

  it('listConversations 返回正序完整会话历史', () => {
    addMessage('dave', null, { role: 'user', content: 'first' })
    addMessage('dave', null, { role: 'assistant', content: 'second' })
    addMessage('dave', null, { role: 'user', content: 'third' })

    const convs = listConversations('dave', null, 20)
    expect(convs).toHaveLength(3)
    expect(convs[0].content).toBe('first')
    expect(convs[2].content).toBe('third')
  })

  it('recentConversations 跨会话倒序返回最近 N 条', () => {
    addMessage('eve', null, { role: 'user', content: 'a' })
    addMessage('frank', null, { role: 'user', content: 'b' })
    addMessage('eve', null, { role: 'user', content: 'c' })

    const recent = recentConversations(2)
    expect(recent).toHaveLength(2)
    expect(recent[0].content).toBe('c')
    expect(recent[1].content).toBe('b')
  })
})

describe('Storage: usage_log', () => {
  beforeEach(() => {
    db.exec('DELETE FROM usage_log;')
  })

  it('usageSummary 累加 in/out token 与调用次数', () => {
    addUsage({
      contactId: 'u1',
      roomId: null,
      model: 'gpt-4o-mini',
      inTokens: 100,
      outTokens: 50,
      durationMs: 800,
    })
    addUsage({
      contactId: 'u2',
      roomId: 'r1',
      model: 'gpt-4o-mini',
      inTokens: 200,
      outTokens: 100,
      durationMs: 1200,
    })

    const summary = usageSummary()
    expect(summary.totalCalls).toBe(2)
    expect(summary.totalIn).toBe(300)
    expect(summary.totalOut).toBe(150)
  })

  it('空表时 usageSummary 返回零值', () => {
    const summary = usageSummary()
    expect(summary.totalCalls).toBe(0)
    expect(summary.totalIn).toBe(0)
    expect(summary.totalOut).toBe(0)
  })

  it('dailyUsage 按天聚合', () => {
    addUsage({ contactId: 'u1', roomId: null, model: 'm', inTokens: 10, outTokens: 5, durationMs: 100 })
    addUsage({ contactId: 'u1', roomId: null, model: 'm', inTokens: 20, outTokens: 15, durationMs: 200 })

    const days = dailyUsage(7)
    expect(days.length).toBeGreaterThanOrEqual(1)
    expect(days[0].calls).toBe(2)
    expect(days[0].inTokens).toBe(30)
    expect(days[0].outTokens).toBe(20)
  })

  it('usageByContact 按总 token 降序排行', () => {
    addUsage({ contactId: 'low', roomId: null, model: 'm', inTokens: 10, outTokens: 10, durationMs: 100 })
    addUsage({ contactId: 'high', roomId: null, model: 'm', inTokens: 1000, outTokens: 1000, durationMs: 100 })

    const rank = usageByContact(10)
    expect(rank[0].contactId).toBe('high')
    expect(rank[0].totalTokens).toBe(2000)
    expect(rank[1].contactId).toBe('low')
    expect(rank[1].totalTokens).toBe(20)
  })
})

describe('Storage: memories', () => {
  beforeEach(() => {
    db.exec('DELETE FROM memories;')
  })

  it('addMemory + allMemories 默认按 id 倒序', () => {
    addMemory({ contactId: 'a', roomId: null, content: 'first' })
    addMemory({ contactId: 'a', roomId: null, content: 'second' })

    const all = allMemories()
    expect(all).toHaveLength(2)
    expect(all[0].content).toBe('second')
    expect(all[1].content).toBe('first')
  })

  it('allMemories 支持按 contactId 过滤', () => {
    addMemory({ contactId: 'a', roomId: null, content: 'a-1' })
    addMemory({ contactId: 'b', roomId: null, content: 'b-1' })
    addMemory({ contactId: 'a', roomId: null, content: 'a-2' })

    const onlyA = allMemories('a')
    expect(onlyA).toHaveLength(2)
    expect(onlyA.every((m) => m.contactId === 'a')).toBe(true)
  })

  it('listMemoryRows / listMemories 返回指定会话的向量与文本', () => {
    addMemory({ contactId: 'c', roomId: 'r', content: 'with-vector', vector: [0.1, 0.2, 0.3] })
    addMemory({ contactId: 'c', roomId: 'r', content: 'no-vector' })

    const rows = listMemoryRows('c', 'r')
    expect(rows).toHaveLength(2)

    // 向量经 JSON 序列化落库，读出后还原为数组
    expect(rows.find((r) => r.content === 'with-vector')!.vector).toEqual([0.1, 0.2, 0.3])
    expect(rows.find((r) => r.content === 'no-vector')!.vector).toBeNull()

    expect(listMemories('c', 'r')).toEqual(['with-vector', 'no-vector'])
  })

  it('listMemoryRows 区分私聊与群聊 roomId', () => {
    addMemory({ contactId: 'd', roomId: null, content: 'private' })
    addMemory({ contactId: 'd', roomId: 'room-x', content: 'group' })

    expect(listMemories('d', null)).toEqual(['private'])
    expect(listMemories('d', 'room-x')).toEqual(['group'])
  })

  it('deleteMemory 真实删除指定 id', () => {
    addMemory({ contactId: 'e', roomId: null, content: 'keep' })
    addMemory({ contactId: 'e', roomId: null, content: 'drop' })

    const dropId = allMemories('e').find((m) => m.content === 'drop')!.id
    deleteMemory(dropId)

    const after = allMemories('e')
    expect(after).toHaveLength(1)
    expect(after[0].content).toBe('keep')
  })

  it('deleteMemory 不存在的 id 静默成功', () => {
    expect(() => deleteMemory(99999)).not.toThrow()
  })
})

describe('Storage: messages (多类型消息流)', () => {
  beforeEach(() => {
    db.exec('DELETE FROM messages;')
  })

  it('recentMessageTypes 按 id 倒序返回消息类型与元信息', () => {
    addMessageRecord({ contactId: 'a', roomId: null, type: '文本', meta: { text: '你好' } })
    addMessageRecord({ contactId: 'a', roomId: null, type: '图片' })

    const list = recentMessageTypes(50)
    expect(list).toHaveLength(2)
    expect(list[0].type).toBe('图片')
    expect(list[0].meta).toBeNull()
    expect(list[1].type).toBe('文本')
    expect(list[1].meta).toEqual({ text: '你好' })
  })

  it('recentMessageTypes 遵守 limit', () => {
    for (let i = 0; i < 5; i++) addMessageRecord({ contactId: 'a', roomId: null, type: '文本' })
    expect(recentMessageTypes(3)).toHaveLength(3)
  })
})

describe('Storage: recall_log (向量召回埋点)', () => {
  beforeEach(() => {
    db.exec('DELETE FROM recall_log;')
  })

  it('recentRecalls 倒序返回 hitIds 与 hitCount', () => {
    addRecall({ contactId: 'a', roomId: null, query: '我喜欢什么', hitIds: [1, 2] })
    addRecall({ contactId: 'a', roomId: null, query: '我的生日', hitIds: [3] })

    const list = recentRecalls(20)
    expect(list).toHaveLength(2)
    // 最新插入的「我的生日」排在最前
    expect(list[0].query).toBe('我的生日')
    expect(list[0].hitCount).toBe(1)
    expect(list[1].hitIds).toEqual([1, 2])
  })

  it('recentRecalls 还原 hitIds 数组与命中数', () => {
    addRecall({ contactId: 'a', roomId: 'r1', query: 'q', hitIds: [10, 20, 30] })
    const [row] = recentRecalls(20)
    expect(row.hitIds).toEqual([10, 20, 30])
    expect(row.hitCount).toBe(3)
    expect(row.roomId).toBe('r1')
  })
})

afterAll(() => {
  closeDb()
  db.close()
  rmSync(tmpDir, { recursive: true, force: true })
})
