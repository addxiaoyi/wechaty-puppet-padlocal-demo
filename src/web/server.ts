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
  recentConversations,
  listConversations,
  usageByContact,
} from '../services/storage'

export function startWebServer(status: StatusHub): Server {
  const app = express()
  app.use(express.json())

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

  // ===== WebUI 页面 =====
  app.get('/', (_req: Request, res: Response) => {
    res.type('html').send(DASHBOARD_HTML)
  })

  const server = app.listen(config.webPort, () => {
    console.log(`[WebUI] 管理面板已启动: http://localhost:${config.webPort}`)
  })

  return server
}

const DASHBOARD_HTML = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>机器人管理面板</title>
<style>
  :root { --fg:#1f2430; --muted:#8a93a6; --accent:#3b82f6; --bg:#f6f7f9; }
  * { box-sizing:border-box }
  body { margin:0; font-family:-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;
    background:var(--bg); color:var(--fg); }
  header { padding:20px 28px; background:#fff; border-bottom:1px solid #e6e8ee;
    display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
  header h1 { margin:0; font-size:20px; }
  header p { margin:4px 0 0; color:var(--muted); font-size:13px; }
  .hdr-right { display:flex; align-items:center; gap:10px; }
  .badge { display:inline-flex; align-items:center; gap:6px; border-radius:999px;
    padding:6px 12px; font-size:13px; font-weight:600; }
  .badge .dot { width:8px; height:8px; border-radius:50%; background:#cbd2df; }
  .badge.online { background:#ecfdf3; color:#067647; }
  .badge.online .dot { background:#12b76a; }
  .badge.offline { background:#fef3f2; color:#b42318; }
  .badge.offline .dot { background:#f04438; }
  .badge.scanning { background:#fff7e6; color:#b54708; }
  .badge.scanning .dot { background:#f79009; animation:pulse 1.2s infinite; }
  @keyframes pulse { 50% { opacity:.4 } }
  .icon-btn { border:1px solid #e6e8ee; background:#fff; color:var(--fg); border-radius:8px;
    padding:6px 10px; cursor:pointer; font-size:13px; }
  .icon-btn:hover { background:#f6f7f9 }
  .banner { display:none; border-radius:12px; padding:16px 20px; }
  .banner.show { display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
  .banner.scan { background:#fff7e6; border:1px solid #fde68a; }
  .banner.ok { background:#ecfdf3; border:1px solid #a6f4c5; color:#067647; }
  .banner img { width:132px; height:132px; image-rendering:pixelated; border-radius:8px; }
  .banner .txt { font-size:14px; line-height:1.7; }
  .loading { opacity:.5; animation:blink 1s infinite; }
  @keyframes blink { 50% { opacity:.3 } }
  #toast { position:fixed; top:16px; left:50%; transform:translateX(-50%);
    background:#1f2430; color:#fff; padding:10px 18px; border-radius:8px; font-size:13px;
    opacity:0; transition:opacity .3s; pointer-events:none; z-index:10; }
  #toast.show { opacity:1; transform:translateX(-50%) translateY(4px); }
  main { max-width:960px; margin:24px auto; padding:0 16px; display:grid; gap:20px; }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:16px; }
  .card { background:#fff; border:1px solid #e6e8ee; border-radius:12px; padding:18px 20px; }
  .card .label { color:var(--muted); font-size:13px; }
  .card .value { font-size:28px; font-weight:700; margin-top:6px; }
  .panel { background:#fff; border:1px solid #e6e8ee; border-radius:12px; padding:20px; }
  .panel h2 { margin:0 0 14px; font-size:16px; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th,td { text-align:left; padding:8px 10px; border-bottom:1px solid #eef0f4; }
  th { color:var(--muted); font-weight:600; }
  button { border:0; background:#fee2e2; color:#b91c1c; border-radius:6px; padding:4px 10px;
    cursor:pointer; font-size:12px; }
  button:hover { filter:brightness(.96) }
  .tag { display:inline-block; background:#eef2ff; color:#4f46e5; border-radius:6px;
    padding:2px 8px; font-size:12px; margin-right:6px; }
  .empty { color:var(--muted); font-size:14px; text-align:center; padding:24px 0; }
  .msg { padding:8px 10px; border-radius:8px; margin:6px 0; font-size:14px; }
  .msg .who { font-size:12px; color:var(--muted); margin-right:8px; }
  .msg.user { background:#eef6ff; }
  .msg.assistant { background:#f4f6fa; }
  .msg .time { float:right; color:var(--muted); font-size:12px; }
  #trend { width:100%; height:200px; }
</style>
</head>
<body>
<header>
  <div>
    <h1>🤖 机器人管理面板</h1>
    <p>Token 用量统计 · 记忆管理 · 机器人状态</p>
  </div>
  <div class="hdr-right">
    <button class="icon-btn" id="refreshBtn">⟳ 刷新</button>
    <span class="badge offline" id="statusBadge"><span class="dot"></span><span id="statusText">连接中…</span></span>
  </div>
</header>
<div id="toast"></div>
<main>
  <section class="banner" id="scanBanner">
    <img id="scanImg" alt="扫码登录二维码" />
    <div class="txt">
      <strong>请使用微信「扫一扫」登录机器人</strong><br />
      二维码自动刷新，扫码后将在本页实时更新状态。
    </div>
  </section>
  <section class="banner ok" id="okBanner">
    <div class="txt">
      <strong>机器人已在线</strong>：<span id="botName">–</span>
    </div>
  </section>

  <section class="cards">
    <div class="card"><div class="label">累计调用次数</div><div class="value" id="calls">–</div></div>
    <div class="card"><div class="label">输入 Token</div><div class="value" id="inTok">–</div></div>
    <div class="card"><div class="label">输出 Token</div><div class="value" id="outTok">–</div></div>
    <div class="card"><div class="label">总 Token</div><div class="value" id="totalTok">–</div></div>
  </section>

  <section class="panel">
    <h2>近 7 天用量趋势</h2>
    <canvas id="trend"></canvas>
    <div class="empty" id="trendEmpty" hidden>暂无数据</div>
  </section>

  <section class="panel">
    <h2>每用户用量排行</h2>
    <table id="rankTable">
      <thead><tr><th>用户</th><th>调用次数</th><th>总 Token</th></tr></thead>
      <tbody id="rankBody"></tbody>
    </table>
    <div class="empty" id="rankEmpty">暂无数据</div>
  </section>

  <section class="panel">
    <h2>最近对话</h2>
    <div id="convBody"></div>
    <div class="empty" id="convEmpty">暂无对话</div>
  </section>

  <section class="panel">
    <h2>记忆管理</h2>
    <table id="memTable">
      <thead><tr><th>ID</th><th>用户</th><th>群</th><th>内容</th><th>时间</th><th></th></tr></thead>
      <tbody id="memBody"></tbody>
    </table>
    <div class="empty" id="memEmpty">暂无记忆</div>
  </section>
</main>

<script>
const $ = (s) => document.querySelector(s);
const fmt = (n) => (n ?? 0).toLocaleString();
const esc = (s) => String(s).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
let toastTimer;

function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

async function loadStatus() {
  try {
    const d = await (await fetch('/api/bot/status')).json();
    const badge = $('#statusBadge'); const text = $('#statusText');
    badge.className = 'badge ' + ({ 'idle':'offline', 'scanning':'scanning', 'logged-out':'offline', 'logged-in':'online' }[d.state] || 'offline');
    $('#scanBanner').classList.toggle('show', d.state === 'scanning');
    $('#okBanner').classList.toggle('show', d.state === 'logged-in');
    $('#botName').textContent = d.userName || '–';
    if (d.state === 'scanning' && d.qrcodeUrl) $('#scanImg').src = d.qrcodeUrl;
    text.textContent = { idle:'初始化中', scanning:'等待扫码', 'logged-out':'已登出', 'logged-in':'在线 · ' + (d.userName || '') }[d.state] || '连接中…';
  } catch { toast('状态获取失败，请稍后重试'); }
}

async function loadSummary() {
  const r = await fetch('/api/usage/summary');
  const d = await r.json();
  $('#calls').textContent = fmt(d.totalCalls);
  $('#inTok').textContent = fmt(d.totalIn);
  $('#outTok').textContent = fmt(d.totalOut);
  $('#totalTok').textContent = fmt((d.totalIn ?? 0) + (d.totalOut ?? 0));
}

async function loadTrend() {
  const r = await fetch('/api/usage/daily?days=7');
  const d = await r.json();
  const data = d.data || [];
  if (!data.length) { $('#trendEmpty').hidden = false; return; }
  $('#trendEmpty').hidden = true;
  drawTrend(data);
}

function drawTrend(data) {
  const canvas = $('#trend'); const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width, H = rect.height, pad = 24;
  const labels = data.map(x => x.date);
  const points = data.map(x => x.inTokens + x.outTokens);
  const max = Math.max(...points, 1);
  const xs = (i) => pad + (W - pad*2) * (i / (points.length - 1 || 1));
  const ys = (v) => H - pad - (H - pad*2) * (v / max);
  ctx.clearRect(0,0,W,H);
  ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2; ctx.beginPath();
  points.forEach((v,i) => i ? ctx.lineTo(xs(i),ys(v)) : ctx.moveTo(xs(i),ys(v)));
  ctx.stroke();
  ctx.fillStyle = '#8a93a6'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center';
  labels.forEach((l,i) => ctx.fillText(l, xs(i), H - 8));
}

async function loadMemories() {
  const r = await fetch('/api/memories');
  const list = await r.json();
  const body = $('#memBody'); body.innerHTML = '';
  $('#memEmpty').hidden = list.length > 0;
  list.forEach(m => {
    const tr = document.createElement('tr');
    const time = new Date(m.created_at).toLocaleDateString('zh-CN');
    tr.innerHTML = '<td>'+m.id+'</td>'
      + '<td>'+esc(m.contact_id)+'</td>'
      + '<td>'+(m.room_id?esc(m.room_id):'–')+'</td>'
      + '<td>'+esc(m.content)+'</td>'
      + '<td>'+time+'</td>'
      + '<td><button data-id="'+m.id+'">删除</button></td>';
    body.appendChild(tr);
  });
  body.querySelectorAll('button').forEach(b => b.onclick = async () => {
    await fetch('/api/memories/'+b.dataset.id, { method:'DELETE' });
    loadMemories();
  });
}
async function loadRanking() {
  const r = await fetch('/api/usage/by-contact');
  const list = await r.json();
  const body = $('#rankBody'); body.innerHTML = '';
  $('#rankEmpty').hidden = list.length > 0;
  list.forEach((u, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td>'+(i+1)+'. '+esc(u.contact_id||u.contactId)+'</td>'
      + '<td>'+esc(u.calls)+'</td><td>'+fmt(u.total_tokens ?? u.totalTokens)+'</td>';
    body.appendChild(tr);
  });
}

async function loadConversations() {
  const r = await fetch('/api/conversations/recent');
  const list = await r.json();
  const conv = $('#convBody'); conv.innerHTML = '';
  $('#convEmpty').hidden = list.length > 0;
  const roleLabel = { user:'问', assistant:'答' };
  list.slice().reverse().forEach(m => {
    const who = (m.contact_id||m.contactId) + (m.room_id ? ' [群]' : '');
    const div = document.createElement('div');
    div.className = 'msg ' + m.role;
    const t = new Date(m.created_at).toLocaleTimeString('zh-CN', {hour:'2-digit',minute:'2-digit'});
    div.innerHTML = '<span class="who">'+esc(who)+' · '+roleLabel[m.role]+'</span>'
      + '<span class="time">'+t+'</span><div>'+esc(m.content)+'</div>';
    conv.appendChild(div);
  });
}

function refreshAll() {
  loadSummary(); loadTrend(); loadMemories(); loadRanking(); loadConversations();
}
loadStatus(); refreshAll();
$('#refreshBtn').addEventListener('click', refreshAll);
setInterval(loadStatus, 5000);       // 状态/二维码 5s 轮询
setInterval(refreshAll, 30000);      // 数据 30s 轮询
</script>
</body>
</html>`