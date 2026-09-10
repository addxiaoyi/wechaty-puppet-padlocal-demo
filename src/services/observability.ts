import os from 'node:os'
import fs from 'node:fs'

// ==================== 系统资源采样 ====================

interface CpuSample {
  idle: number
  total: number
}

let lastCpu: CpuSample | null = null
let lastNet: { rx: number; tx: number; at: number } | null = null

function readCpu(): CpuSample {
  const cpus = os.cpus()
  let idle = 0
  let total = 0
  for (const c of cpus) {
    idle += c.times.idle
    total += c.times.user + c.times.nice + c.times.sys + c.times.idle + c.times.irq
  }
  return { idle, total }
}

// 读取 /proc/net/dev 累计字节数，跨平台不可用时回退 0
function readNet(): { rx: number; tx: number } {
  try {
    const txt = fs.readFileSync('/proc/net/dev', 'utf8')
    let rx = 0
    let tx = 0
    for (const line of txt.split('\n')) {
      const i = line.indexOf(':')
      if (i === -1) continue
      if (/lo:|lo$/.test(line)) continue
      const cols = line.slice(i + 1).trim().split(/\s+/).map(Number)
      if (cols.length < 9 || Number.isNaN(cols[0])) continue
      rx += cols[0]
      tx += cols[8]
    }
    return { rx, tx }
  } catch {
    return { rx: 0, tx: 0 }
  }
}

export interface SystemStats {
  cpuPercent: number | null
  mem: { total: number; used: number; percent: number }
  load: number[]
  uptime: number
  procUptime: number
  net: { rxPerSec: number; txPerSec: number }
  platform: string
  arch: string
  nodeVersion: string
  hostname: string
  pid: number
  rss: number
  heapUsed: number
}

// 每次调用对比上一次快照，产出瞬时 CPU 占用率与网卡速率
export function systemStats(): SystemStats {
  const cpu = readCpu()
  let cpuPercent: number | null = null
  if (lastCpu) {
    const idleDelta = cpu.idle - lastCpu.idle
    const totalDelta = cpu.total - lastCpu.total
    cpuPercent = totalDelta > 0 ? Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100)) : 0
  }
  lastCpu = cpu

  const net = readNet()
  const now = Date.now()
  let rxPerSec = 0
  let txPerSec = 0
  if (lastNet && now > lastNet.at) {
    rxPerSec = Math.max(0, (net.rx - lastNet.rx) / ((now - lastNet.at) / 1000))
    txPerSec = Math.max(0, (net.tx - lastNet.tx) / ((now - lastNet.at) / 1000))
  }
  lastNet = { ...net, at: now }

  const mem = process.memoryUsage()
  const totalMem = os.totalmem()
  const freeMem = os.freemem()

  return {
    cpuPercent,
    mem: {
      total: totalMem,
      used: totalMem - freeMem,
      percent: Math.round(((totalMem - freeMem) / totalMem) * 100),
    },
    load: os.loadavg(),
    uptime: os.uptime(),
    procUptime: process.uptime(),
    net: { rxPerSec, txPerSec },
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    hostname: os.hostname(),
    pid: process.pid,
    rss: mem.rss,
    heapUsed: mem.heapUsed,
  }
}

// ==================== 环形日志缓冲 ====================

export interface LogEntry {
  ts: number
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
}

const MAX_LOG = 500
const ring: LogEntry[] = []

function push(level: LogEntry['level'], message: string): void {
  ring.push({ ts: Date.now(), level, message })
  if (ring.length > MAX_LOG) ring.shift()
}

// 拦截 console 四兄弟，镜像到环形缓冲（保留原始写出行为）
let installed = false
export function installLogCapture(): void {
  if (installed) return
  installed = true

  const map: Array<[keyof Console, LogEntry['level']]> = [
    ['log', 'info'],
    ['info', 'info'],
    ['warn', 'warn'],
    ['error', 'error'],
    ['debug', 'debug'],
  ]

  // console 各方法重载签名不同，统一按宽松可调用类型处理
  const c = console as unknown as Record<string, (...args: unknown[]) => void>

  for (const [method, level] of map) {
    const original = c[method].bind(console)
    c[method] = (...args: unknown[]) => {
      const message = args
        .map((a) => (typeof a === 'string' ? a : safeStringify(a)))
        .join(' ')
      push(level, message)
      original(...args)
    }
  }
}

function safeStringify(v: unknown): string {
  if (v instanceof Error) return v.stack || v.message
  try {
    return typeof v === 'object' ? JSON.stringify(v) : String(v)
  } catch {
    return String(v)
  }
}

// 供业务代码主动记录一条日志（如登录/扫码/召回等关键事件）
export function botLog(level: LogEntry['level'], message: string): void {
  push(level, message)
}

// 供 WebUI 拉取最近 N 条日志（倒序返回，前端按需正序展示）
export function recentLogs(limit = 200): LogEntry[] {
  return ring.slice(-limit)
}