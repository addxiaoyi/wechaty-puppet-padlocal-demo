import { config } from '../config'
import { addMessage, addMemory, addUsage, listMemories, recentMessages } from './storage'
import { llm, Llm, LlmError } from './llm'
import type { ChatMsg } from './llm'

export interface AskParams {
  contactId: string
  roomId: string | null
  text: string
}

// 学习指令：命中即以"记笔记"方式持久化一段用户告知的信息
const LEARN_RE = /^\s*(记住|记一下|记忆|记得|learn)[:：]?\s+(.+?)\s*$/

function tryLearn(text: string): string | null {
  const m = LEARN_RE.exec(text)
  return m ? m[2].trim() : null
}

// 组装上下文：先注回忆，后接历史对话。当前用户消息已落库，故无需再追加
function buildContextMessages(
  contactId: string,
  roomId: string | null
): ChatMsg[] {
  const memory = listMemories(contactId, roomId)
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

// 机器人入口：处理学习指令、调用 LLM、记录用量并回写会话历史。
export async function askAgent(p: AskParams): Promise<string> {
  // 学习指令优先，不消耗 token
  const learned = tryLearn(p.text)
  if (learned) {
    addMemory({ contactId: p.contactId, roomId: p.roomId, content: learned })
    addMessage(p.contactId, p.roomId, { role: 'user', content: p.text })
    addMessage(p.contactId, p.roomId, { role: 'assistant', content: '已记住 ✅' })
    return '已记住 ✅'
  }

  const client = llm
  if (!(client instanceof Llm)) {
    // 未配置 LLM 时仍记录历史，保证对话上下文完整
    addMessage(p.contactId, p.roomId, { role: 'user', content: p.text })
    return '❌ 未配置 LLM，暂时无法智能回复'
  }

  addMessage(p.contactId, p.roomId, { role: 'user', content: p.text })

  const started = Date.now()
  let result
  try {
    result = await client.chat(buildContextMessages(p.contactId, p.roomId))
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