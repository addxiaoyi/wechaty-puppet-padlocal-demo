import { config } from '../config'
import {
  addMessage,
  addMemory,
  addUsage,
  addRecall,
  listMemoryRows,
  recentMessages,
} from './storage'
import type { MemoryRow } from './storage'
import { llm, Llm, LlmError } from './llm'
import type { ChatMsg } from './llm'

export interface AskParams {
  contactId: string
  roomId: string | null
  text: string
}

// 学习指令：命中即以"记笔记"方式持久化一段用户告知的信息
const LEARN_RE = /^\s*(记住|记一下|记忆|记得|learn)[:：]?\s+(.+?)\s*$/

// 最多注入的相似记忆条数
const MEMORY_TOP_K = 3

function tryLearn(text: string): string | null {
  const m = LEARN_RE.exec(text)
  return m ? m[2].trim() : null
}

// 余弦相似度；维度不匹配或空向量返回 -1（视为不相似）
function cosine(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || a.length !== b.length) {
    return -1
  }
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) {
    return 0
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// 语义检索：embedding 当前问题，取相似度最高的 top-k 条记忆。
// 任何一步失败（未配 embedding / 服务异常）则回退为最近几条，保证流程不中断。
async function retrieveMemory(
  client: Llm,
  contactId: string,
  roomId: string | null,
  query: string
): Promise<string[]> {
  const rows = listMemoryRows(contactId, roomId)
  if (rows.length === 0) {
    return []
  }

  let hits: MemoryRow[] = rows.slice(-MEMORY_TOP_K) // 兜底：最近几条
  try {
    const qVec = await client.embed(query)
    const ranked = rows
      .map((r) => ({ r, score: cosine(qVec, safeVector(r)) }))
      .sort((a, b) => b.score - a.score)
    hits = ranked.slice(0, MEMORY_TOP_K).map((x) => x.r)
  } catch {
    // embedding 不可用，保留兜底结果
  }

  // 埋点召回命中：记录本轮查询命中了哪些记忆 id，供 WebUI「向量召回」页展示
  if (hits.length > 0) {
    addRecall({
      contactId,
      roomId,
      query,
      hitIds: hits.map((r) => r.id),
    })
  }

  return hits.map((r) => r.content)
}

// 解析存储的向量 JSON；非法时视为无向量
function safeVector(row: MemoryRow): number[] {
  try {
    const v = Array.isArray(row.vector) ? row.vector : JSON.parse(String(row.vector))
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

// 组装上下文：相似记忆置顶，后接历史对话。当前用户消息已落库，无需再追加
async function buildContextMessages(
  client: Llm,
  contactId: string,
  roomId: string | null,
  query: string
): Promise<ChatMsg[]> {
  const memory = await retrieveMemory(client, contactId, roomId, query)
  const history = recentMessages(contactId, roomId, 10)
  const messages: ChatMsg[] = []

  if (memory.length > 0) {
    messages.push({
      role: 'system',
      content: `以下是关于该用户/群的已知记忆，回复时可参考：\n${memory.join('\n')}`,
    })
  }

  for (const m of history) {
    messages.push({ role: m.role, content: m.content })
  }

  return messages
}

// 向量化并保存记忆；embedding 失败则保存无向量版本，保证学习不丢失
async function persistMemory(
  client: Llm,
  contactId: string,
  roomId: string | null,
  content: string
): Promise<void> {
  let vector: number[] | null = null
  try {
    vector = await client.embed(content)
  } catch {
    // 无 embedding 能力时降级为纯文本记忆
  }
  addMemory({ contactId, roomId, content, vector })
}

// 供 WebUI「记忆学习」页手动新增记忆：向量化后落库，无 LLM 时降级为纯文本记忆
export async function addMemoryManually(p: {
  contactId: string
  roomId?: string | null
  content: string
}): Promise<void> {
  const client = llm
  if (client instanceof Llm) {
    await persistMemory(client, p.contactId, p.roomId ?? null, p.content)
  } else {
    addMemory({ contactId: p.contactId, roomId: p.roomId ?? null, content: p.content })
  }
}

// 机器人入口：处理学习指令、调用 LLM、记录用量并回写会话历史。
export async function askAgent(p: AskParams): Promise<string> {
  // 学习指令优先，不消耗 token
  const learned = tryLearn(p.text)
  if (learned) {
    addMessage(p.contactId, p.roomId, { role: 'user', content: p.text })
    const client = llm
    if (client instanceof Llm) {
      await persistMemory(client, p.contactId, p.roomId, learned)
    } else {
      addMemory({ contactId: p.contactId, roomId: p.roomId, content: learned })
    }
    addMessage(p.contactId, p.roomId, { role: 'assistant', content: '已记住 ✅' })
    return '已记住 ✅'
  }

  const client = llm
  if (!(client instanceof Llm)) {
    // 未配置 LLM 时仍记录历史，保证对话上下文完整
    addMessage(p.contactId, p.roomId, { role: 'user', content: p.text })
    return '❌ 未配置 LLM，暂时无法智能回复'
  }

  const started = Date.now()
  addMessage(p.contactId, p.roomId, { role: 'user', content: p.text })

  let result
  try {
    const messages = await buildContextMessages(client, p.contactId, p.roomId, p.text)
    result = await client.chat(messages)
  } catch (e) {
    if (e instanceof LlmError) {
      addMessage(p.contactId, p.roomId, {
        role: 'assistant',
        content: `抱歉，智能回复暂时不可用（${e.message}）`,
      })
      return `⚠️ ${e.message}`
    }
    throw e
  }

  addUsage({
    contactId: p.contactId,
    roomId: p.roomId,
    model: config.llm!.model,
    inTokens: result.inTokens,
    outTokens: result.outTokens,
    durationMs: Date.now() - started,
  })
  addMessage(p.contactId, p.roomId, { role: 'assistant', content: result.content })

  return result.content
}