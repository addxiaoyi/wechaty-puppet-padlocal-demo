# wechaty-puppet-padlocal-demo

基于 Wechaty 的微信机器人，支持**可插拔 Puppet 通道**、**LLM 智能回复**、**长期记忆**、**Token 用量统计**与 **WebUI 管理面板**。

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

## 常用脚本
```bash
npm run build      # 编译到 dist/
npm run start      # 运行编译产物
npm run demo       # ts-node 直接运行
npm run typecheck  # 类型检查
npm run lint       # ESLint 检查
npm run format     # Prettier 格式化
```

## 项目结构
```
├── main.ts                 # 入口：启动 WebUI + 机器人
├── src/
│   ├── config.ts           # .env 配置读取与校验
│   ├── bot.ts              # 机器人初始化与事件注册
│   ├── handlers/message.ts # 消息处理（@ 判断、回复）
│   └── services/
│       ├── puppet.ts       # 可插拔通道封装（padlocal/service）
│       ├── storage.ts      # SQLite：记忆 / 用量 / 对话历史
│       ├── llm.ts          # OpenAI 兼容 LLM 客户端
│       ├── agent.ts        # 对话编排：记忆注入 + 用量记录
│       └── web/server.ts   # Express WebUI + REST API
├── .env.example            # 配置模板（不提交 .env）
└── package.json
```

## 说明
- `wechaty-puppet-padlocal` 已长期停更，微信服务端升级后可能触发「版本过低，无法登录」。如需稳定运行，建议改用 `WECHATY_PUPPET_PROVIDER=service` 通道。