# 后端与数据持久化设计（P1）

> 状态：**P1 进行中**。已完成：monorepo + core 包、服务端框架、数据库（饮食/聊天表除外）、验证码登录。
> 下一步：业务接口 → Web 端接入 → 老数据导入。饮食相关表等"吃"的模型确定后再建。
> 已定：Node + PostgreSQL 部署在腾讯云；手机短信 + 邮箱验证码登录；在线为主，断网时只保留训练计时。

## 1. 总体架构

```
┌──────────── 客户端（Web，以后是小程序） ────────────┐
│  UI ── 查询缓存（服务端数据的本地副本，只读缓存）      │
│   │                                                  │
│   └─ 写操作 ── API（在线）                            │
│   └─ 训练计时 ── 本地离线队列 ──（恢复网络后补传）     │
└──────────────────────────┬───────────────────────────┘
                           │ HTTPS  /api/v1
┌──────────────────────────▼───────────────────────────┐
│ Node API（Fastify）：认证 · 业务接口 · AI 代理(P2 编排) │
│        └─ Drizzle ORM ── PostgreSQL（腾讯云）          │
└──────────────────────────────────────────────────────┘
```

**在线为主**的含义：
- 服务端是唯一数据源。客户端的写操作直接调用接口，成功后更新本地缓存。
- 断网时只有训练计时可用：开始、暂停、结束都先写本地，联网后按顺序补传。其他写操作在断网时提示"网络不可用"。
- 多端一致：应用回到前台时刷新，前台每 60 秒轮询一次。P4 再换成实时推送。

虽然在线为主，下面这些仍然一开始就做好，以后升级到离线优先不需要改表：
- ID 由客户端生成（ULID）：创建接口用 `PUT /x/:id` 做幂等写入，重复提交不会产生重复数据。
- 每张业务表都有 `updated_at` 和 `deleted_at`（软删除）。

## 2. 代码组织（monorepo，npm workspaces）

```
packages/core     纯 TS：类型、zod 校验、ops、推算（训练/热量/过程分）、项目目录、AI 工具 schema
apps/web          现在的 React 应用（改为调用 API）
apps/server       Fastify + Drizzle + 认证 + 业务接口 + AI 代理
```

`src/lib/training.ts`、`energy.ts`、`pillars.ts`、`plan.ts`、`data/*` 迁入 core。服务端用同一套 zod schema 校验入参，用同一套推算函数（比如 AI 提示词里的热量账本），保证各端算出的数字一致。

## 3. 技术选型

| 部分 | 选择 | 说明 |
|---|---|---|
| 运行时 | Node 20 + TypeScript | 和前端共享代码 |
| Web 框架 | Fastify | 成熟，自带 schema 校验、限流插件，性能好 |
| ORM / 迁移 | Drizzle + drizzle-kit | 类型安全，SQL 透明，迁移文件可评审 |
| 数据库 | PostgreSQL 15 | 腾讯云 TencentDB for PostgreSQL（或 CVM 自建） |
| 认证 | Access JWT（15 分钟）+ Refresh Token（30 天，轮换） | Web 端 refresh 放 httpOnly Cookie；小程序放本地存储 |
| 短信 | 腾讯云短信 SMS | 需要申请**签名和模板**并通过审核 |
| 邮件 | 腾讯云邮件推送 SES（或任意 SMTP） | 需要验证发信域名 |
| 部署 | 腾讯云轻量服务器 / CVM + Docker Compose（api + nginx） | 域名需要 ICP 备案 + HTTPS |
| 本地开发 | 默认用 **PGlite**（PostgreSQL 编译成 WebAssembly，内嵌在 Node 里）；也可以 `npm run db:up` 用 Docker 跑真 Postgres。短信/邮件用控制台打印验证码 | 不需要 Docker 和任何云账号就能开发；测试用内存数据库 |

## 4. 数据库表

通用约定：
- `id text` 为客户端生成的 ULID（`users` 等系统表由服务端生成）。
- 身高、体重、腰围、强度系数用 `double precision`（读出来直接是 JS number，62.3 不会变成 62.29999）。
- 所有业务表都有 `user_id`、`created_at`、`updated_at`、`deleted_at`，查询默认过滤掉已删除的记录。
- `source` 取值：`app` / `game` / `guided` / `chat` / `manual`。
- 日期字段 `date` 是用户本地日期（`date` 类型）。时间点用 `timestamptz`。

### 4.1 账号与认证

```sql
users (
  id            text primary key,          -- ULID，服务端生成
  nickname      text,
  timezone      text not null default 'Asia/Shanghai',
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz                -- 注销（30 天后物理删除）
)

auth_identities (                           -- 一个用户可以绑定多种登录方式
  id            text primary key,
  user_id       text not null references users,
  kind          text not null,             -- phone | email | wechat(以后)
  value         text not null,             -- 手机号 E.164 / 小写邮箱 / unionid
  verified_at   timestamptz not null,
  unique (kind, value)
)

verification_codes (
  id            text primary key,
  kind          text not null,             -- phone | email
  target        text not null,
  code_hash     text not null,             -- 只存哈希
  expires_at    timestamptz not null,      -- 10 分钟
  attempts      int not null default 0,    -- 最多 5 次
  consumed_at   timestamptz,
  ip            inet,
  created_at    timestamptz not null default now()
)

refresh_tokens (
  id            text primary key,
  user_id       text not null references users,
  token_hash    text not null unique,
  device        text,                      -- UA 摘要，用于"登录设备管理"
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  replaced_by   text                       -- 轮换链；旧 token 被重复使用时整条链作废
)

consents (                                  -- 《个保法》敏感个人信息单独同意
  user_id       text not null references users,
  kind          text not null,             -- privacy_policy | health_data | ai_processing
  version       text not null,
  granted_at    timestamptz not null,
  revoked_at    timestamptz,
  primary key (user_id, kind, version)
)
```

### 4.2 档案与计划

```sql
profiles (                                  -- 1:1，测评答案 + 计划状态
  user_id       text primary key references users,
  sex           text not null,
  birth_year    int not null,              -- 存出生年，年龄现算（不会过期）
  height_cm     numeric(4,1) not null,
  weight_kg     numeric(4,1) not null,     -- 测评时体重；之后的体重在 day_logs
  waist_cm      numeric(4,1),
  shape         text not null,
  targets       text[] not null,
  experience    int not null,
  equipment     text[] not null,
  days_per_week int not null,
  minutes       int not null,
  start_date    date not null,
  intensity     numeric(3,2) not null default 1,
  updated_at    timestamptz not null default now()
)
```

### 4.3 睡 · 吃 · 水 · 身体

```sql
day_logs (                                  -- 每天一个值的字段
  user_id       text not null references users,
  date          date not null,
  sleep_bed     time,
  sleep_wake    time,
  sleep_quality text,
  sleep_source  text,
  weight_kg     numeric(4,1),
  waist_cm      numeric(4,1),
  summary       text,                      -- AI 每日总结
  updated_at    timestamptz not null default now(),
  primary key (user_id, date)
)

water_logs (                                -- 喝水改为"事件"，当天总量现算
  id            text primary key,
  user_id       text not null references users,
  date          date not null,
  ml            int not null,              -- 可为负数（撤销一杯）
  source        text not null,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
)

```

> **为什么喝水改为事件**：现在存的是"当天总量"。两台设备各点一次 +250，按"以新的为准"会丢一次。改成事件后两次都会被保留。AI 的 `mode=set`（"今天一共喝了 2 升"）会写入一条差值事件。

### 4.3b 饮食（已定：整餐为主可展开条目 · 四种记录方式 · 热量 + 三大营养素）

**模型：一餐 = 一条 `meals`，可以有 0 到多条 `meal_items`。**
- 没有条目时，热量和营养素就是整餐上填的数（比如"约 600 千卡"）。
- 有条目时，整餐数值 = 条目之和，由服务端在保存时重新计算。条目是唯一数据源。
- 营养数值在保存时**快照**到记录上。以后食物库改了数值，历史记录不会跟着变。

```sql
meals (
  id            text primary key,          -- 客户端生成
  user_id       text not null references users,
  date          date not null,
  slot          text not null,             -- breakfast | lunch | dinner | snack
  eaten_at      timestamptz,
  title         text not null,             -- "黄焖鸡米饭"
  kcal          int,                       -- 未知为 null（不计入摄入，首页提示估算）
  protein_g     double precision,
  carbs_g       double precision,
  fat_g         double precision,
  input_method  text not null,             -- chat | photo | favorite | search | manual
  confidence    text,                      -- high | medium | low（AI / 拍照估算的可信度）
  photo_key     text,                      -- 对象存储里的图片（拍照记录时）
  source        text not null,
  chat_msg_id   text,
  created_at, updated_at, deleted_at
)

meal_items (
  id            text primary key,
  meal_id       text not null references meals,
  user_id       text not null references users,  -- 冗余，方便权限过滤
  food_id       text references foods,     -- 匹配到食物库时填写
  name          text not null,             -- "米饭"
  amount        double precision not null, -- 1
  unit          text not null,             -- g | ml | 碗 | 个 | 份 | 片 | 杯
  grams         double precision,          -- 换算后的克数（能换算时）
  kcal          int,
  protein_g, carbs_g, fat_g  double precision,
  position      int not null,
  confidence    text,
  created_at, updated_at, deleted_at
)

foods (                                     -- 食物库（公共 + 用户自定义）
  id            text primary key,
  owner_id      text references users,     -- null = 公共食物库；有值 = 某用户自定义
  name          text not null,             -- "鸡胸肉（熟）"
  aliases       text[] not null default '{}',  -- {"鸡胸", "鸡胸脯"}
  category      text not null,             -- 主食 | 肉蛋 | 蔬菜 | 外卖菜品 | 饮品 …
  kcal_100g     double precision not null,
  protein_100g, carbs_100g, fat_100g  double precision not null,
  units         jsonb not null,            -- [{"unit":"碗","grams":150},{"unit":"份","grams":200}]
  default_unit  text not null,
  verified      boolean not null default false,  -- 人工核对过
  created_at, updated_at, deleted_at
)
```

**四种记录方式如何落到同一个模型上：**

| 方式 | 流程 | 写入 |
|---|---|---|
| 跟 AI 说一句话 | AI 输出食物名 + 份量（克数或常见单位）→ **服务端先查食物库**，匹配到就按每 100g 数值计算，匹配不到才用模型自己的估算，并标为低可信度 | 直接保存（沿用"不先征求确认"的规则），聊天里显示，可以修改 |
| 拍照识别 | 图片上传到腾讯云对象存储（私有桶）→ 视觉模型（GLM-4V / 千问 VL）输出条目 JSON → 同样经过食物库校准 → **先展示为草稿**，用户确认或调整份量后保存 | 确认后保存，`input_method=photo` |
| 常吃一键记 | 从用户最近 60 天的饮食里，按"标题 + 条目"分组统计次数，取最常吃的前若干个（现算，不另建表）→ 点一下复制成今天的一餐 | 直接保存，`input_method=favorite` |
| 食物库搜索 | 按名称和别名搜索 → 选份量单位和数量 → 加入当前这一餐的条目 | 直接保存，`input_method=search` |

**为什么 AI 估算要先过食物库**：让大模型直接报热量，同一碗米饭两次可能给出 200 和 260。让它只负责"识别是什么、大概多少"，营养数值由食物库计算，结果稳定，也方便换模型。

**食物库的数据来源**：《中国食物成分表》受版权保护，不能整库导入。第一版自建约 300 种常见食物和外卖菜品：先用 AI 生成初稿，再参照公开资料（如美国农业部 USDA 的公有领域数据、营养指南里的常见份量）人工核对，核对过的标记为 `verified`。用户可以添加自定义食物（`owner_id` 为本人）。

**拍照的隐私处理**：图片存在私有桶，只通过临时签名链接访问；用户可以删除单张照片；注销账号时一起删除。视觉模型调用前需要用户同意"AI 处理"（`consents.ai_processing`）。

### 4.4 训练与小镇

```sql
training_sessions (                         -- 结构与现在的 TrainingSession 一致
  id            text primary key,          -- 客户端生成（离线计时的关键）
  user_id       text not null references users,
  activity_id   text not null,
  title         text,
  facility_id   text,
  source        text not null,
  status        text not null,             -- active | completed
  start_at      timestamptz not null,
  end_at        timestamptz,
  paused_at     timestamptz,
  paused_ms     bigint not null default 0,
  date          date not null,
  rpe           text,
  kcal          int,
  details       jsonb,                     -- 跟练的动作明细
  note          text,
  chat_msg_id   text,
  created_at, updated_at, deleted_at
)
-- 每个用户同时最多一条进行中的训练
create unique index one_active_session on training_sessions(user_id) where status = 'active' and deleted_at is null;

facilities (
  id            text primary key,
  user_id       text not null references users,
  kind          text not null,
  name          text,
  pos_x         int not null,
  pos_y         int not null,
  created_at, updated_at, deleted_at
)

avatars (
  user_id       text primary key references users,
  skin          text not null default 'default',
  outfit        text not null default 'default',
  updated_at    timestamptz not null default now()
)
```

经验、等级、设施等级、体型阶段、过程分、热量账本：**不入库**，各端用 core 包现算。

### 4.5 AI（P1 只建表，P2 使用）

```sql
chat_messages (                             -- 中立格式，不绑定任何一家模型
  id            text primary key,
  user_id       text not null references users,
  role          text not null,             -- user | assistant | tool
  content       text,
  tool_calls    jsonb,                     -- [{id, name, args}]
  tool_call_id  text,
  tool_label    text,                      -- 同步标签
  model         text,                      -- 生成这条消息的模型，如 zhipu/glm-5.3
  tokens_in     int, tokens_out int,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
)

coach_notes (                               -- 长期记忆：换模型后新模型也"认识"用户
  id            text primary key,
  user_id       text not null references users,
  kind          text not null,             -- habit | preference | injury | goal
  text          text not null,             -- 如"平时 1 点睡、不吃早饭"
  source_msg_id text,
  created_at, updated_at, deleted_at
)
```

## 5. 接口（REST，`/api/v1`）

### 5.1 认证

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/code` | `{kind: phone/email, target}` 发送验证码。限流：同一目标 60 秒 1 次、每天 10 次；同一 IP 每小时 30 次 |
| POST | `/auth/verify` | `{kind, target, code, consents[]}` → 登录或注册，返回 access token，同时设置 refresh Cookie |
| POST | `/auth/refresh` | 轮换 refresh token |
| POST | `/auth/logout` | 作废当前 refresh token |
| POST | `/auth/bind` | 已登录用户再绑定一个手机号或邮箱（同样走验证码） |

新用户第一次登录时必须勾选：隐私政策、健康数据处理。"发送给 AI 服务商处理"在第一次使用教练时单独询问。

### 5.2 数据

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/bootstrap` | 启动时一次拉齐：档案、头像、设施、进行中的训练、近 35 天的所有日数据 |
| GET | `/days?from&to` | 一段日期内的 day_logs、喝水、饮食、训练（进展页、更早的历史） |
| PUT | `/profile` | 测评 / 重新测评 |
| PATCH | `/days/:date` | 睡眠 / 体重 / 腰围 / 总结（部分字段更新） |
| PUT | `/water/:id` · DELETE | 喝水事件 |
| PUT | `/meals/:id` · DELETE | 饮食（PUT = 幂等创建或更新） |
| PUT | `/sessions/:id` · DELETE | 训练：开始、暂停、继续、结束都是对同一条记录的 PUT |
| PUT | `/facilities/:id` · DELETE | 小镇设施 |
| PUT | `/avatar` | 外观 |
| POST | `/import` | 第一次登录后上传本机已有的 localStorage 数据（见第 7 节） |
| GET | `/export` · POST `/account/delete` | 导出全部数据 / 注销（《个保法》要求） |

写接口返回服务端保存后的完整记录，客户端用它更新缓存。服务端负责校验：
- **权限**：所有查询都强制带 `user_id`，在数据访问层统一注入，路由层没法绕开。
- **业务规则**：比如同时只能有一条进行中的训练（数据库唯一索引兜底）、数值范围、日期合法性。

## 6. 断网时的训练计时

```
开始/暂停/继续/结束
   │ 1. 立即更新本地（本地存当前这条 session 的完整状态）
   │ 2. 加入离线队列：PUT /sessions/:id（完整记录）
   ▼
队列在联网 / 回到前台时按顺序补传；同一 id 只保留最后一次（完整记录覆盖）
```

- 时间戳都是客户端打的，所以断网期间计时照样准确。
- 补传是幂等的（完整记录 PUT），重复发送也没关系。
- 如果另一台设备已经有一条进行中的训练，服务端返回 409，客户端提示"另一台设备正在训练中"，让用户选择保留哪一条。

## 7. 老数据迁移（localStorage → 账号）

第一次登录成功后，如果本机有 `tmc:v3` 数据：
1. 账号是新的：整体上传到 `POST /import`，服务端校验后按 id 写入。
2. 账号已有数据（在别的设备上用过）：训练、饮食、设施、喝水这些按 id 合并，不会重复；档案只有一份，让用户选择保留"这台设备的"还是"账号里的"。
3. 上传成功后清除本地的 `tmc:v3`，之后以服务端为准。

## 8. 安全与合规清单

- 验证码只存哈希，有效期 10 分钟，最多试 5 次；返回统一的错误文案（不暴露"这个手机号是否注册过"）。
- Refresh token 轮换。旧 token 被重复使用时，判定为泄露，整条链全部作废。
- 日志不记录手机号、邮箱、饮食内容这类个人信息。
- 数据库开启自动备份，开启存储加密；只通过内网访问。
- 隐私政策、健康数据同意、AI 处理同意，都按版本号记录在 `consents` 表。
- 支持数据导出和账号注销：软删除后 30 天物理删除。

## 9. 需要你准备的事项（不影响本地开发）

| 事项 | 说明 | 什么时候需要 |
|---|---|---|
| 腾讯云账号 + 实名 | | 部署时 |
| 域名 + ICP 备案 | 一般需要 1–3 周，**建议尽早开始** | 部署时 |
| 短信签名 + 模板 | 个人也可以申请，但需要已备案的网站，或已上线的小程序/公众号作为证明 | 上线短信登录时 |
| 邮件发信域名 | SES 需要在 DNS 加验证记录 | 上线邮箱登录时 |
| 腾讯云对象存储 COS | 私有存储桶，存饮食照片；本地开发用磁盘目录代替 | 上线拍照识别时 |
| 视觉模型 | 智谱 GLM-4V 或千问 VL，复用现有 AI Key 即可（需确认账户有额度） | 拍照识别时 |

在这些准备好之前，本地开发和内测都可以用"控制台打印验证码"的方式进行。

## 10. P1 实现步骤

1. **重组目录为 monorepo**：抽出 `packages/core`，Web 端改为从 core 引用。现有功能保持不变，测试全部通过。
2. **搭建 `apps/server`**：用 Docker Compose 跑本地 Postgres，Drizzle 建表加迁移。
3. **认证**：验证码（开发环境用控制台打印）、JWT、refresh 轮换、同意记录。
4. **业务接口**加上数据访问层的权限控制，写接口测试（包括"A 用户不能读写 B 用户的数据"）。
5. **Web 端接入**：登录页、启动拉取、写操作改为调用 API、训练离线队列、回到前台时刷新。
6. **老数据导入**。
7. **两个浏览器模拟两台设备**，验证同步，然后更新文档。

AI 编排移到服务端放在 P2，P1 期间沿用现有的 `/api/chat` 代理。
