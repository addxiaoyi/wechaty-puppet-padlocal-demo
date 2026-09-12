# NapCat 风格 UI 合规审核报告

文件：`/workspace/ui-demo/index.html`
审核依据：Web Interface Guidelines

## 已修复项

### 动画
- **transition: all** → 显式属性列表
  - `.pin-chk`、`.pin-step button`、`.rec .chk`、`.rec .acts button`、`.cal-nav`、`.cal-chip`、`.cal-cell` 等 6 处
- **prefers-reduced-motion** 全局媒体查询：禁用动画与过渡，隐藏状态环呼吸光晕

### 可访问性
- 为 icon-only 按钮补充 `aria-label`：
  - 顶部菜单按钮、账户按钮、抽屉关闭按钮、会话详情关闭按钮
  - 列表置顶、删除、消息删除等按钮
- 日历翻页按钮已有 `aria-label`

### 表单与文本
- 占位符 `https://...` → `https://…`

### 暗色模式
- `<meta name="theme-color" content="#1a1a1a">`
- `html { color-scheme: dark; }`

### 滚动行为
- `.modal` 与 `.sh-b` 增加 `overscroll-behavior: contain;`

## 待持续优化

- 长表单增加字段级错误提示与恢复焦点
- 图表增加键盘可访问的数据表后备
- 实时日志滚动增加 `aria-live` 与节流更新
- 状态环颜色对比度在不同背景下的 AA 验证
