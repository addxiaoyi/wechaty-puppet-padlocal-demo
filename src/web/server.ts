import express from 'express'
import type { Request, Response } from 'express'
import { config } from '../config'
import { dailyUsage, usageSummary, allMemories, deleteMemory } from '../services/storage'

export function startWebServer(): void {
  const app = express()
  app.use(express.json())

  // ===== REST API =====
  // 用量总览
  app.get('/api/usage/summary', (_req: Request, res: Response) => {
    res.json(usageSummary())
  })

  // 近 N 天用量趋势
  app.get('/api/usage/daily', (req: Request, res: Response) => {
    const days = Number.parseInt(String(req.query.days ?? '7'), 10)
    res.json({ days, data: dailyUsage(Number.isNaN(days) ? 7 : days) })
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

  app.listen(config.webPort, () => {
    console.log(`[WebUI] 管理面板已启动: http://localhost:${config.webPort}`)
  })
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
  header { padding:20px 28px; background:#fff; border-bottom:1px solid #e6e8ee; }
  header h1 { margin:0; font-size:20px; }
  header p { margin:4px 0 0; color:var(--muted); font-size:13px; }
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
  #trend { width:100%; height:200px; }
</style>
</head>
<body>
<header>
  <h1>🤖 机器人管理面板</h1>
  <p>Token 用量统计 · 记忆管理 · 机器人状态</p>
</header>
<main>
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
const esc = (s) => String(s).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));

loadSummary(); loadTrend(); loadMemories();
</script>
</body>
</html>`