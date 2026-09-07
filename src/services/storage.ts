import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { config } from '../config'

export interface ConvMsg {
  role: 'user' | 'assistant'
  content: string
}

export interface UsageRecord {
  contactId: string
  roomId: string | null
  model: string
  inTokens: number
  outTokens: number
  durationMs: number
}

export interface DailyUsage {
  date: string
  calls: number
  inTokens: number
  outTokens: number
}

export interface MemoryPayload {
  contactId: string
  roomId: string | null
  content: string
  vector?: number[] | null
}

export interface MemoryRow extends MemoryPayload {
  id: number
}

export interface ConversationRow {
  id: number
  contactId: string
  roomId: string | null
  role: string
  content: string
  createdAt: number
}

// 确保 db 文件所在目录存在，避免 better-sqlite3 打开失败
mkdirSync(dirname(config.dbPath), { recursive: true })

const db = new Database(config.dbPath)

db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id TEXT NOT NULL,
    room_id TEXT,
    role TEXT NOT NULL CHECK(role IN ('user','assistant')),
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS usage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id TEXT NOT NULL,
    room_id TEXT,
    model TEXT NOT NULL,
    in_tokens INTEGER NOT NULL,
    out_tokens INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contact_id TEXT NOT NULL,
    room_id TEXT,
    content TEXT NOT NULL,
    content_vector TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_conv_lookup
    ON conversations(contact_id, room_id, id);
  CREATE INDEX IF NOT EXISTS idx_usage_lookup
    ON usage_log(created_at);
  CREATE INDEX IF NOT EXISTS idx_mem_lookup
    ON memories(contact_id, room_id);
`)

// 兼容旧库：自 0.3.0 起 memories 增加 content_vector 列，老库通过迁移补齐
const MEM_COLS = db.prepare(`PRAGMA table_info(memories)`).all() as Array<{ name: string }>
if (!MEM_COLS.some((c) => c.name === 'content_vector')) {
  db.exec('ALTER TABLE memories ADD COLUMN content_vector TEXT')
}

// 会话消息落库：私聊 room_id 存 NULL；群聊存 room_id 用于隔离同名用户
export function addMessage(
  contactId: string,
  roomId: string | null,
  msg: ConvMsg
): void {
  db.prepare(
    `INSERT INTO conversations(contact_id, room_id, role, content, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(contactId, roomId, msg.role, msg.content, Date.now())
}

// 读取某会话最近 N 条历史（私聊匹配 room_id IS NULL）
export function recentMessages(
  contactId: string,
  roomId: string | null,
  limit = 10
): ConvMsg[] {
  const rows = db
    .prepare(
      `SELECT role, content FROM conversations
       WHERE contact_id = ? AND room_id IS ?
       ORDER BY id DESC LIMIT ?`
    )
    .all(contactId, roomId, limit) as Array<{ role: 'user' | 'assistant'; content: string }>
  return rows.reverse()
}

export function addUsage(rec: UsageRecord): void {
  db.prepare(
    `INSERT INTO usage_log(contact_id, room_id, model, in_tokens, out_tokens, duration_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    rec.contactId,
    rec.roomId,
    rec.model,
    rec.inTokens,
    rec.outTokens,
    rec.durationMs,
    Date.now()
  )
}

export function dailyUsage(days = 7): DailyUsage[] {
  return db
    .prepare(
      `SELECT date(created_at/1000, 'unixepoch') as date,
              count(*) as calls,
              sum(in_tokens) as inTokens,
              sum(out_tokens) as outTokens
       FROM usage_log
       WHERE created_at >= ?
       GROUP BY date ORDER BY date DESC LIMIT ?`
    )
    .all(Date.now() - days * 86400_000, days) as unknown as DailyUsage[]
}

export function usageSummary(): {
  totalCalls: number
  totalIn: number
  totalOut: number
} {
  return db
    .prepare(
      `SELECT count(*) as totalCalls,
              COALESCE(sum(in_tokens),0) as totalIn,
              COALESCE(sum(out_tokens),0) as totalOut
       FROM usage_log`
    )
    .get() as { totalCalls: number; totalIn: number; totalOut: number }
}

export function addMemory(m: MemoryPayload): void {
  db.prepare(
    `INSERT INTO memories(contact_id, room_id, content, content_vector, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    m.contactId,
    m.roomId,
    m.content,
    m.vector ? JSON.stringify(m.vector) : null,
    Date.now()
  )
}

// 返回指定用户/群的全部记忆，含向量（JSON 文本），供调用方做相似度检索
export function listMemoryRows(contactId: string, roomId: string | null): MemoryRow[] {
  return db
    .prepare(
      `SELECT id, contact_id as contactId, room_id as roomId, content, content_vector as vector, created_at
       FROM memories
       WHERE contact_id = ? AND room_id IS ?
       ORDER BY id ASC`
    )
    .all(contactId, roomId) as unknown as MemoryRow[]
}

export function listMemories(contactId: string, roomId: string | null): string[] {
  return listMemoryRows(contactId, roomId).map((r) => r.content)
}

export function deleteMemory(id: number): void {
  db.prepare('DELETE FROM memories WHERE id = ?').run(id)
}

export function allMemories(contactId?: string): MemoryRow[] {
  if (contactId) {
    return db
      .prepare(
        `SELECT id, contact_id as contactId, room_id as roomId, content, created_at
         FROM memories WHERE contact_id = ? ORDER BY id DESC`
      )
      .all(contactId) as unknown as MemoryRow[]
  }
  return db
    .prepare(
      `SELECT id, contact_id as contactId, room_id as roomId, content, created_at
       FROM memories ORDER BY id DESC`
    )
    .all() as unknown as MemoryRow[]
}

// 最近对话列表（按会话分组取末条），用于 WebUI 快速浏览
export function recentConversations(limit = 50): ConversationRow[] {
  return db
    .prepare(
      `SELECT id, contact_id as contactId, room_id as roomId, role, content, created_at
       FROM conversations ORDER BY id DESC LIMIT ?`
    )
    .all(limit) as unknown as ConversationRow[]
}

// 某段会话的完整历史（私聊按 contactId；群聊按 contactId|roomId）
export function listConversations(
  contactId: string,
  roomId: string | null,
  limit = 20
): ConversationRow[] {
  const rows = db
    .prepare(
      `SELECT id, contact_id as contactId, room_id as roomId, role, content, created_at
       FROM conversations
       WHERE contact_id = ? AND room_id IS ?
       ORDER BY id DESC LIMIT ?`
    )
    .all(contactId, roomId, limit) as unknown as ConversationRow[]
  return rows.reverse()
}

export interface ContactUsage {
  contactId: string
  calls: number
  totalTokens: number
}

// 每用户用量排行（按 token 降序）
export function usageByContact(limit = 20): ContactUsage[] {
  return db
    .prepare(
      `SELECT contact_id as contactId,
              count(*) as calls,
              SUM(in_tokens + out_tokens) as totalTokens
       FROM usage_log
       GROUP BY contact_id
       ORDER BY totalTokens DESC LIMIT ?`
    )
    .all(limit) as unknown as ContactUsage[]
}

export function closeDb(): void {
  db.close()
}