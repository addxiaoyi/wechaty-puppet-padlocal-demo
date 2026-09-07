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
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_conv_lookup
    ON conversations(contact_id, room_id, id);
  CREATE INDEX IF NOT EXISTS idx_usage_lookup
    ON usage_log(created_at);
  CREATE INDEX IF NOT EXISTS idx_mem_lookup
    ON memories(contact_id, room_id);
`)

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

// 会话标识统一用 contact_id|room_id 分隔，保证私聊/群成员记忆相互隔离
function convKey(contactId: string, roomId: string | null): string {
  return roomId ? `${roomId}|${contactId}` : contactId
}

export function recentMessages(
  contactId: string,
  roomId: string | null,
  limit = 10
): ConvMsg[] {
  const key = convKey(contactId, roomId)
  const rows = db
    .prepare(
      `SELECT role, content FROM conversations
       WHERE concat(contact_id, '|', coalesce(room_id, '')) = ?
       ORDER BY id DESC LIMIT ?`
    )
    .all(key, limit) as Array<{ role: 'user' | 'assistant'; content: string }>
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
              sum(in_tokens) as in_tokens,
              sum(out_tokens) as out_tokens
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
    `INSERT INTO memories(contact_id, room_id, content, created_at)
     VALUES (?, ?, ?, ?)`
  ).run(m.contactId, m.roomId, m.content, Date.now())
}

export function listMemories(contactId: string, roomId: string | null): string[] {
  const key = convKey(contactId, roomId)
  const rows = db
    .prepare(
      `SELECT content FROM memories
       WHERE concat(contact_id, '|', coalesce(room_id, '')) = ?
       ORDER BY id ASC`
    )
    .all(key) as Array<{ content: string }>
  return rows.map((r) => r.content)
}

export function deleteMemory(id: number): void {
  db.prepare('DELETE FROM memories WHERE id = ?').run(id)
}

export function allMemories(contactId?: string): Array<MemoryPayload & { id: number }> {
  if (contactId) {
    return db
      .prepare('SELECT id, contact_id, room_id, content FROM memories WHERE contact_id = ? ORDER BY id DESC')
      .all(contactId) as Array<MemoryPayload & { id: number }>
  }
  return db
    .prepare('SELECT id, contact_id, room_id, content FROM memories ORDER BY id DESC')
    .all() as Array<MemoryPayload & { id: number }>
}

export function closeDb(): void {
  db.close()
}