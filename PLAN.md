# 项目二次开发规划（wechaty-puppet-padlocal-demo）

## 背景结论（基于实际调研）

当前 `wechaty` 生态已发生重大变化，原项目依赖均已停更多年：

| 依赖 | 当前版本 | 最后更新时间 |
|------|----------|--------------|
| wechaty | `1.19.10` → 最新 `1.20.2` | 维护中 |
| wechaty-puppet | `1.19.6` → 最新 `1.20.2` | 维护中 |
| wechaty-puppet-padlocal | `1.11.18` → 最新 `1.20.1` | **2022-06-09 停更** |

> **关键结论**：`wechaty-puppet-padlocal` 已 3 年多未更新，官方 `wechaty/puppet-padlocal` 仓库未归档但已无实质维护。微信服务端协议持续升级，沿用 PadLocal 会触发"应用版本过低，无法登录"（issue #2806）。因此**不建议继续绑定 PadLocal**。

## 推荐演进路线

1. **短期（保持 Wechaty + 消息通道复用）**
   - 升级 `wechaty` / `wechaty-puppet` 到 `1.20.2`（API 兼容，`WechatyBuilder` 用法不变）。
   - 将 Puppet 从「硬编码 padlocal」解耦为「可插拔通道」，通过环境变量切换协议（PadLocal / Service / 其他）。
   - Token、API 地址等敏感信息迁移到 `.env`，不再写死在代码里。

2. **中长期（移植成熟能力）**
   - 把 Wechaty 仅作为「消息通道」，参考以下项目移植「记忆 + Token 监控 + WebUI」能力：

| 项目 | 亮点 | 借鉴点 |
|------|------|--------|
| AstrBot | 插件生态、Token/耗时统计、知识库、完整 WebUI | 通道抽象 + WebUI 架构 |
| wechat-agent-bot | SQLite 持久记忆、多模型、WebUI(3210) | 按用户/群隔离记忆存储 |
| webot | 群总结、待办、长期记忆、React 仪表盘 | 群记忆 + 学习群风格 |
| LangBot | RAG 知识库、Agent、Web 面板 | 知识库编排 |
| BananaBot | 记忆隔离、Token 用量记录、群模式 | usageRecords 用量记录 |

## 目标代码结构（本次重构落地）

```
wechaty-puppet-padlocal-demo/
├── main.ts                 # 入口：加载配置、启动 bot
├── src/
│   ├── bot.ts              # 机器人初始化与事件注册
│   ├── config.ts           # .env 配置读取与校验
│   ├── handlers/
│   │   └── message.ts      # 消息处理（解析 + 回复）
│   └── services/
│       └── padlocal.ts     # Puppet 通道封装（可插拔）
├── .env.example            # Token / API 地址模板（不提交 .env）
└── package.json
```

## 本次执行步骤

- [ ] 1. 升级依赖（wechaty 1.20.2、wechaty-puppet 1.20.2、dotenv），移除过期 padlocal 硬编码
- [ ] 2. 新增 `.env` / `.env.example` 与 `src/config.ts`（Token、API 基址读取 + 校验）
- [ ] 3. 抽取 `src/bot.ts`（初始化 + 事件集中注册）
- [ ] 4. 抽取 `src/handlers/message.ts`（替代原 `helper.ts`）
- [ ] 5. 新增 `src/services/padlocal.ts`（可插拔 Puppet 封装）
- [ ] 6. 精简 `main.ts` 为入口，删除 `helper.ts`，更新 `package.json` scripts 与 `.gitignore`
- [ ] 7. `npm install` + `tsc --noEmit` 校验，输出编译通过

## 待确认（执行前）

1. **Puppet 通道**：本次重构是否仍保留 PadLocal（升级到 1.20.1，接受停更风险），还是直接切到 `wechaty-puppet-service`（推荐、仍在维护）？
2. **产物形态**：仅做「通道解耦 + 结构重构」即可，还是需要本次就引入 `.env` + `dotenv`？
3. **是否引入测试/ESLint**：当前项目无任何工程化配置，是否需要一并补齐？