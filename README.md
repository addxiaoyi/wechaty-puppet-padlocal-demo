# wechaty-puppet-padlocal-demo

基于 Wechaty 的微信机器人，支持**可插拔 Puppet 通道**、**LLM 智能回复**、**矢量记忆检索**、**Token 用量统计**与 **WebUI 管理面板**。

## 快速开始

### 0. 环境准备
需要 Node.js >= 16（本项目在 v24 下验证通过）。

### 1. 安装依赖
```bash
npm install
```

### 2. 配置
复制模板配置并填写：
```bash
cp .env.example .env
```

关键配置项（见 `.env.example`）：
- `WECHATY_PUPPET_PROVIDER`：`padlocal` | `service`，选择消息通道
- `WECHATY_PUPPET_PADLOCAL_TOKEN` / `WECHATY_PUPPET_SERVICE_TOKEN`：对应通道 Token
- `WEB_PORT`：WebUI 管理面板端口（默认 `8765`）
- `DB_PATH`：SQLite 数据文件路径（记忆/用量/对话）
- `LLM_API_BASE` / `LLM_API_KEY` / `LLM_MODEL`：OpenAI 兼容 API 配置（可选，缺 key 则回退规则回复）

### 3. 运行
```bash
# 直接运行
npm run demo

# 编译后运行
npm run build && npm start
```

启动后：
1. 终端显示扫码二维码（或浏览器打开链接）登录微信
2. WebUI 管理面板运行在 `http://localhost:<WEB_PORT>`

## 功能说明

| 能力 | 说明 |
|------|------|
| 可插拔通道 | 通过 `WECHATY_PUPPET_PROVIDER` 在 `padlocal` / `service` 间切换 |
| LLM 智能回复 | 接入 OpenAI 兼容 API，支持群聊（仅被 @ 时回复）与私聊 |
| 矢量记忆检索 | 记忆经 Embedding 向量化并按余弦相似度检索 top-k 注入上下文 |
| Token 用量统计 | 记录每次调用输入/输出 token 与耗时，支持按天/按用户聚合 |
| WebUI 面板 | 用量趋势、Token 汇总、每用户排行、对话历史、记忆管理 |

### 学习指令
对机器人发送 `记住 我住在北京`，将向量化并作为该用户/群的长期记忆保存。后续对话按语义相似度检索最相关的记忆回复。

### 矢量检索说明
- 记忆存储时通过 `LLM_EMBEDDING_MODEL` 向量化
- 每次对话先用 `Embedding` 计算当前消息向量，对该会话全部记忆做余弦相似度排序，取 top-3 注入
- Embedding 服务不可用时自动降级为最近几条记忆，流程不中断

### 群聊策略
- 私聊：直接回复
- 群聊：仅当机器人被 @ 时回复（使用 wechaty 官方 `mentionSelf()` 判断），避免刷屏

## WebUI 与 REST API

管理面板运行在 `http://localhost:<WEB_PORT>`，页面包含：用量趋势图、Token 汇总、每用户用量排行、最近对话、记忆管理。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/usage/summary` | 累计调用次数与 Token 汇总 |
| GET | `/api/usage/daily?days=7` | 近 N 天用量趋势 |
| GET | `/api/usage/by-contact` | 每用户用量排行（按 token 降序） |
| GET | `/api/conversations/recent` | 最近对话流（跨会话） |
| GET | `/api/conversations?contactId=` | 某段会话完整历史 |
| GET | `/api/memories?contactId=` | 记忆列表（可按用户过滤） |
| DELETE | `/api/memories/:id` | 删除指定记忆 |

## 常用脚本
```bash
npm run build      # 编译到 dist/
npm run start      # 运行编译产物
npm run demo       # ts-node 直接运行（同时拉起机器人与 WebUI）
npm run web:dev    # 仅启动 WebUI + API，不拉起机器人（前端联调用）
npm run test:e2e   # API 端到端测试（需先 npm run web:dev）
npm run typecheck  # 类型检查
npm run lint       # ESLint 检查
npm run format     # Prettier 格式化
```

### 仅启动 WebUI（前端联调）
`npm run web:dev` 只拉起 Express WebUI 与 REST API，**不初始化 wechaty 机器人**，因此无需真实扫码登录，适合前端开发与接口联调。

由于 `config.ts` 在校验阶段仍要求提供 Puppet 通道与 Token，本地联调前请先准备一份 `.env`（Token 可填任意占位值，例如 `test-placeholder-token`）：

```bash
cp .env.example .env
# 编辑 .env：WECHATY_PUPPET_PADLOCAL_TOKEN 填占位值即可，无需真实 Token

npm run web:dev          # 启动 http://localhost:8765
# 另开一个终端
npm run test:e2e         # 跑 10 项 API 端到端测试
```

## Docker 部署

项目内置 `Dockerfile` 与 `.dockerignore`，可使用以下方式构建部署：

```bash
# 构建镜像（多阶段：编译 TS → 精简运行时）
docker build -t wechaty-bot .

# 运行：通过 --env-file 注入配置，挂载数据卷持久化
docker run -d --name wechaty-bot \
  --env-file .env \
  -v "$PWD/bot-data:/app/bot-data" \
  -p 8765:8765 \
  wechaty-bot
```

Docker 说明：
- 基础镜像 `node:20-slim`（Debian 系）。`better-sqlite3` 为原生模块需用 glibc 镜像才能复用预编译包，故不使用 Alpine。
- `.env` 通过 `--env-file` 运行时注入，不打包进镜像，避免密钥泄露。
- `bot-data/` 挂载 volume 持久化数据库，重建容器不丢数据。
- 容器启动命令为 `node dist/main.js`，同时拉起机器人与 WebUI。

## 项目结构
```
├── main.ts                 # 入口：启动 WebUI + 机器人
├── src/
│   ├── config.ts           # .env 配置读取与校验
│   ├── bot.ts              # 机器人初始化与事件注册
│   ├── handlers/message.ts # 消息处理（@ 判断、回复）
│   └── services/
│       ├── puppet.ts       # 可插拔通道封装（padlocal/service）
│       ├── storage.ts      # SQLite：记忆(含向量)/用量/对话历史
│       ├── llm.ts          # OpenAI 兼容 LLM + Embedding 客户端
│       ├── agent.ts        # 对话编排：矢量检索 + 用量记录
│       └── web/
│           ├── server.ts   # Express WebUI + REST API
│           └── start-webui.ts # 仅启动 WebUI（不拉起机器人，供联调/测试）
├── .env.example            # 配置模板（不提交 .env）
├── Dockerfile              # 多阶段构建：compile + slim 运行时
├── .dockerignore           # 排除依赖/数据/密钥进镜像
└── package.json
```

## 说明
- `wechaty-puppet-padlocal` 已长期停更，微信服务端升级后可能触发「版本过低，无法登录」。如需稳定运行，建议改用 `WECHATY_PUPPET_PROVIDER=service` 通道。