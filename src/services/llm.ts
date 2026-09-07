import { config } from '../config'

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LlmResult {
  content: string
  inTokens: number
  outTokens: number
}

export class LlmError extends Error {}

export class Llm {
  private readonly apiBase: string
  private readonly apiKey: string
  private readonly model: string
  private readonly systemPrompt: string

  constructor() {
    const c = config.llm
    if (!c) {
      throw new Error('LLM 未配置，无法调用 Llm')
    }
    this.apiBase = c.apiBase.replace(/\/$/, '') // 去掉末尾斜杠便于拼接
    this.apiKey = c.apiKey
    this.model = c.model
    this.systemPrompt = c.systemPrompt
  }

  async chat(messages: ChatMsg[]): Promise<LlmResult> {
    const body = {
      model: this.model,
      messages: [{ role: 'system', content: this.systemPrompt }, ...messages],
    }

    let res: Response
    try {
      res = await fetch(`${this.apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      })
    } catch (e) {
      throw new LlmError(`请求 LLM 失败: ${e}`)
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new LlmError(`LLM 返回 ${res.status}: ${detail.slice(0, 200)}`)
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const choice = data.choices?.[0]
    if (!choice) {
      throw new LlmError('LLM 响应缺少 choices')
    }

    return {
      content: choice.message?.content ?? '',
      inTokens: data.usage?.prompt_tokens ?? 0,
      outTokens: data.usage?.completion_tokens ?? 0,
    }
  }
}

// 单例直接复用；模块级实例在未配置时惰性失效，由调用方捕获
export const llm = config.llm ? new Llm() : null