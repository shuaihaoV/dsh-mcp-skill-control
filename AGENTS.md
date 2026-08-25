# AGENTS.md — dsh-mcp-skill-control 开发规范

> 面向在本仓库工作的 AI 编码代理（以及人类协作者）。目标：任何新会话读完本文即可安全、高效地改这个插件。

## 项目是什么

DSH（DeepSeek Harness）的**第三方双面插件**：在 Web GUI 会话头部提供一个 MCP 服务器管理面板（查看状态 / 启停 / 重启 / 新增 / 删除 / JSON 导入）。

- **单包双面**：Host 半（`src/`，跑在 dsh 进程，loader 树中行 id `mcp-manager`）+ Browser 半（`src/client/`，打包成浏览器 bundle）
- **零 DSH 源码改动**：独立于 `deepseek-harness` 仓库分发，经 `dsh plugin --profile web add` 安装
- 详细功能与使用说明见 `README.md`；本文只讲**怎么改代码**

## 仓库地图

```
src/                       Host 半（Node，tsc 直出 lib/types → tsdown 打 lib/index.js）
├── index.ts               入口：默认导出 McpManagerService（服务类插件形态）
├── service.ts             核心：@Remote RPC 方法 + 兜底 HTTP 路由 + 探测 + 操作互斥
├── inventory.ts           只读投影：loader entries + tools registry → McpServerRow
├── patch-writer.ts        持久化：YAML Document AST 编辑 cordis.patch.yml
├── shared.ts              inventory 与 patch-writer 共用的基元（解循环依赖）
└── types.ts               线上词汇，纯类型（双半共享，无运行时代码）

src/client/                Browser 半（React；tsdown 打成 lib/client.js 的 __ModuleLoader__ 格式）
├── index.ts               入口：slot 注册 + locale 注册 + 自适应轮询
├── McpPanel.tsx           面板：胶囊按钮 + 下拉服务器列表 + 删除确认
├── McpAddDialog.tsx       新增对话框：表单 / JSON 导入双模式
├── spec-parse.ts          纯解析：表单字段 + 第三方 MCP 配置 JSON
├── store.ts               可观察快照 store（rows/busy/error/actionError）
├── port.ts                Host 通道：RPC 主 + 兜底 HTTP 降级
├── styles.ts              面板样式（字符串注入 <style>，只用已验证的 --dsw-* token）
└── locales.ts             zh/en 词典

scripts/build.sh           构建：链接全局 dsh 依赖 → tsc → tsdown
tsdown.config.ts           双入口打包配置（Node ESM + browser closure-factory）
cordis.patch.yml           bundle patch 层：插入 mcp-manager host 行
lib/                       构建产物（本地生成，不入库；见下文"构建产物纪律"）
```

## 构建与验证

```bash
bash scripts/build.sh              # 完整构建：tsc + tsdown，产物在 lib/
bash scripts/build.sh --no-emit    # 仅类型检查（快速反馈环）
```

- 依赖解析：`scripts/build.sh` 把 `~/.bun/install/global/node_modules`（bun 全局 dsh 安装）的 `@deepseek-ai`、`react`、`yaml` symlink 进本包 `node_modules/`；可用 `DSH_GLOBAL_NM` 环境变量覆盖路径
- 前置条件：本机已通过 bun 全局安装 dsh（`~/.bun/install/global/node_modules/@deepseek-ai/cordis` 必须存在），否则构建脚本报错退出
- 本地开发不安装运行时依赖——**全部类型与产物从全局 dsh 安装借来**；devDependencies 只有工具链（typescript / tsdown / @types/*）
- 无单测框架；改动后的最低验证 = `--no-emit` 类型检查 + 浏览器手动验收（见"手动验收流程"）

### 手动验收流程

```bash
bash scripts/build.sh
dsh plugin --profile web add /path/to/dsh-mcp-skill-control   # 已装过则跳过
# 重启 dsh web（Host 半改动必须重启；Browser 半改动刷新页面即可）
open http://127.0.0.1:3080
```

验收点：会话头部右上角出现 "MCP" 胶囊 → 展开列出所有 mcp-client 行 → 停用/启用/重启/新增/删除各走一遍 → 重启 dsh 验证持久化。

## 生效模型（改哪半、怎么生效）

| 改动 | 生效方式 |
|---|---|
| Browser 半（`src/client/**` → `lib/client.js`） | 刷新页面 |
| Host 半（`src/*.ts` → `lib/index.js`） | **重启 dsh 进程** |
| `cordis.patch.yml` | 自动（HMR 事务应用） |

## 硬约束（改代码前必读）

### 1. Host 半禁止 minify / 改参数名

typert gateway 的 SRC 发现靠**函数参数名**匹配 wire 字段。`service.ts` 里 `@Remote` 方法的参数名（如 `entryId`、`spec`）是线上契约的一部分——**不要重命名**；构建用 tsc 直出（当前 build.sh 即如此），不要引入 minify。

### 2. 只用 `Entry.update()`，绝不碰 EntryTree 写路径

`EntryTree.create/update/remove` 会把整个合成树固化写进 `<profile>/cordis.yml`，破坏 patch 层叠语义。运行时对齐漂移只允许 `ctx.loader.resolve(id)` → `entry.update({disabled})`；持久变更只允许写 `cordis.patch.yml` 让 watcher 应用。

### 3. patch 层持久化语义（`patch-writer.ts` 的根基）

- `- insert: [...]` 追加行；顶层 `- id: <row>` 覆盖既有行字段；**没有 delete patch**
- 因此删除 = 从本层 insert 块摘除该行；bundle 层的行只能停用
- 一切写入走 `yaml` 的 `parseDocument` → 改 AST → `toString()`，保注释/键序/内联格式；已验证增删撤销后字节级一致
- 行 id 约束：稳定 id 匹配 `[A-Za-z0-9_.-]+` 且不是 8-hex 随机样式（loader 每次启动重铸随机 id，patch 写了也定位不到）

### 4. 状态派生，不镜像

面板状态每次 `list()` 从 loader entry 树 + `ctx.tools.schemas()` 实时投影。不要引入缓存或影子状态机。唯一派生态是 `unreachable`（active 且零工具持续 20s，DwellTracker 记开始时间）。

### 5. 双半依赖边界

- `src/types.ts` 是唯一被双半 import 的词汇表，**纯类型**
- `shared.ts` 放双半（或 inventory/patch-writer 间）共用的运行时基元——它存在的意义是打断 `inventory ↔ patch-writer` 循环 import
- Browser 半不得 import Host 半的运行时代码（类型可以）；反之亦然

### 6. UI 纪律

- 交互控件一律用 `@deepseek-ai/dsh-client-ui-primitives`（Button/Input/Modal/Pill/StateDot/Tooltip/图标），它们自带主题样式
- `styles.ts` 只写布局，**不写字面色值**，只引用已验证存在的 `--dsw-*` token（名单见该文件头注释）；设计系统没有的控件（如 toggle 开关）才自己画
- 词典改动必须同时补 zh 和 en（`locales.ts` 的 `en` 用 `Record<keyof typeof zh, string>` 强制）

### 7. 安全红线

- **不展示、不解析、不回显** `env` / `headers` 的值（密钥泄漏面）。探测（probe）重放 headers 仅限该行自身 URL，属既有目的地
- 兜底 HTTP 路由只镜像 @Remote 方法语义，请求体上限 64KB
- 插件不执行用户 shell 命令；stdio `command` 只是写给 mcp-client 的配置

## 关键机制速查

| 机制 | 位置 | 要点 |
|---|---|---|
| RPC 方法 | `service.ts` | `list` / `add` / `remove` / `disable` / `enable` / `restart`，`@Remote('name')` 装饰；返回值带 `ok` 判别 |
| 操作互斥 | `service.ts` `guarded()` | per-entryId in-flight Map，并发返回 `transition-in-flight` |
| 等待 HMR 应用 | `service.ts` `waitFor()` | 100ms 轮询；启停 3s / add 5s / restart 8s 上限；add 超时不回滚 |
| unreachable 判定 | `inventory.ts` | active + 零工具 ≥ 20s（`UNREACHABLE_DWELL_MS`）；仅 streamable-http 触发探测（30s 限频） |
| 兜底路由 | `service.ts` constructor | `ctx.inject(['webServer'], …)` 响应式注册（本服务激活早于 webServer，一次性 `ctx.get` 会拿 undefined——历史 bug，勿回退） |
| RPC 降级 | `port.ts` | 仅 `invocation-unavailable`（发现失败）降级到 HTTP；业务错误原样抛 |
| store 错误模型 | `store.ts` | `error`（读失败，下次成功读清除）与 `actionError`（操作失败，粘性，需手动关）分离；busy 由可变 Set 权威持有 |
| JSON 导入 | `spec-parse.ts` | 三种文档形状；SSE 拦截；名称 slug 化；顺序 add |
| client bundle | `tsdown.config.ts` | browser 半是 CJS + banner/footer 包成 `window.__ModuleLoader__.load({id, factory})`；external 全靠 loader 模块表解析 |
| 样式注入 | `styles.ts` | `ensurePanelStyle` 幂等；已存在则比对内容替换（HMR 免刷新换 CSS） |

## 常见任务

- **加一个面板操作**：`types.ts` 定结果类型 → `service.ts` 加 `@Remote` 方法 → `port.ts` 加通道方法 → `store.ts` 加 action → `McpPanel.tsx` 接 UI → `locales.ts` 双语。Host 参数名即线上契约，定稿前想清楚
- **改状态判定**：只动 `inventory.ts` 的 `projectEntry`；新状态记得同步 `types.ts`、`McpPanel.tsx` 的 `STATE_KEY`/`DOT_STATE` 映射、词典
- **改 patch 写入**：只动 `patch-writer.ts`；改完必须手动验证「增 → 删 → 与原文件 diff 为空」
- **加导入格式**：只动 `spec-parse.ts`（纯函数，好测）；保持问题条目给 `problem` 而非抛错
- **升级 dsh 兼容**：peerDependencies 版本范围 + 重跑构建 + 手动验收；`styles.ts` 头注释里的 token 名单要重新核实

## 历史坑（违反会复发）

1. **webServer 兜底路由曾永远注册不上**：constructor 里一次性 `ctx.get('webServer')` 在服务激活时拿到 `undefined`（webServer 尚未出现）→ 静默跳过。必须用 `ctx.inject(['webServer'], …)` 响应式注册
2. **设计 token 名曾大面积不存在**（`--dsw-alias-fill-l1` 等杜撰名）：样式静默回落硬编码 hex、无视主题。新增 token 前先在 web 产物里核实其存在
3. **store busy 竞态与 error 覆盖**：`finally` 里基于陈旧闭包重建 busy；操作失败信息被紧随的 `refresh()` 成功路径抹掉。现行设计：busy 用可变 Set 权威持有；`error`/`actionError` 分离且生命周期独立
4. **Host 半 minify 会破坏 RPC**：SRC 参数名匹配是运行时行为，构建链不得引入改名
5. **client bundle 首次热装配可能不进 boot 图**：扫描 flush 赶在 fiber 激活前；再次热重载即进。全新安装无此问题

## 文档维护约定

- `README.md`：面向**使用者**——功能、安装、状态语义、行为细节、已知限制。行为变更必须同步
- `AGENTS.md`（本文）：面向**开发者**——约束、机制、坑。改架构/约束时更新
- 源码头部注释承载设计意图（如 `service.ts` 的操作语义表、`styles.ts` 的 token 白名单），改动时同步

## 构建产物纪律

`lib/` **不入库**（`.gitignore` 已忽略）——公开仓库只含源码与文档，产物由使用者本地构建。因此：

- 改 `src/` 后必须重跑 `bash scripts/build.sh` 重建 `lib/`，否则安装的是旧产物
- `dsh plugin add <dir>` / 发布前，`lib/` 必须存在（`package.json` 的 main/exports 指向 `lib/`）；Clone 下来的目录要先构建再安装
- 不要手工编辑 `lib/`
- `tsdown.config.ts` 的 browser 半输出格式（closure-factory banner/footer）是 loader 模块表的契约，不可随意改
