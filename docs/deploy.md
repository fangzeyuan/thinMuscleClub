# 内测部署手册（约 30 分钟）

目标：把薄肌俱乐部部署到一台云服务器上，手机随时打开、添加到主屏幕当 App 用。

**内测方案**：腾讯云**香港**轻量应用服务器（不需要 ICP 备案）+ 免费域名 `IP.sslip.io` + Caddy 自动 HTTPS + 邮箱验证码登录 + 内测白名单。
备案下来后可以迁回内地服务器，代码不用改，只改 `deploy/.env` 里的 `DOMAIN`。

```
手机浏览器 ──HTTPS──► Caddy（80/443，自动证书）──► 应用（Node，含网页）──► PostgreSQL
                                                    └──► 智谱 / 千问（AI 教练）
                                                    └──► QQ 邮箱 SMTP（发验证码）
```

---

## 第 1 步：准备 QQ 邮箱发信（5 分钟）

用来给登录的人发验证码。建议单独注册一个 QQ 邮箱专门发信。

1. 网页登录 QQ 邮箱 → **设置** → **账号与安全**（或"账户"）→ 找到 **POP3/IMAP/SMTP 服务** → 开启 **SMTP 服务**
2. 按提示用手机发短信验证 → 得到一串 16 位的**授权码**（不是 QQ 密码），记下来

> 用 163 邮箱也可以：服务器 `smtp.163.com`，端口 465，同样需要授权码。

## 第 2 步：买服务器（10 分钟）

1. 腾讯云控制台 → **轻量应用服务器** → 新建
2. 地域：**中国香港**
3. 镜像：**应用镜像 → Docker**（已装好 Docker，省事）；如果没有，选 Ubuntu 22.04，第 3 步会安装 Docker
4. 套餐：**2 核 2G** 起步即可（内测足够）
5. 创建后在实例详情里记下**公网 IP**，例如 `43.128.10.20`
6. **防火墙**页签：确认放行 **TCP 80** 和 **TCP 443**（默认通常已放行 80，443 需要手动加）

## 第 3 步：登录服务器并拉代码（5 分钟）

控制台点"登录"（网页终端），依次执行：

```bash
# 如果镜像不是 Docker 镜像，先安装 Docker（Docker 镜像跳过这一行）
curl -fsSL https://get.docker.com | sh

# 拉代码
git clone https://github.com/fangzeyuan/thinMuscleClub.git
cd thinMuscleClub/deploy
```

## 第 4 步：填配置（5 分钟）

```bash
./init-env.sh        # 生成 .env，自动填好数据库密码和各种密钥
vi .env              # 或 nano .env
```

需要你填写的只有这几项：

| 配置 | 填什么 |
|---|---|
| `DOMAIN` | `公网IP.sslip.io`，例如 `43.128.10.20.sslip.io`（有自己的域名就填域名，并把域名解析到这个 IP） |
| `SMTP_USER` | 发信的 QQ 邮箱，例如 `tmc_bot@qq.com` |
| `SMTP_PASS` | 第 1 步的授权码 |
| `SMTP_FROM` | `薄肌俱乐部 <tmc_bot@qq.com>` |
| `SIGNUP_ALLOWLIST` | 允许注册的邮箱，逗号分隔，先填你自己的 |
| `LLM_API_KEY` | 智谱 API Key（不填则 AI 教练不可用，其他功能正常） |

## 第 5 步：启动（3–5 分钟，第一次要构建镜像）

```bash
docker compose up -d --build
docker compose ps            # 三个服务都是 running / healthy 就好了
docker compose logs -f app   # 看应用日志，Ctrl+C 退出
```

浏览器打开 `https://你的DOMAIN`，能看到登录页就成功了。第一次打开时 Caddy 在申请证书，可能要等十几秒。

## 第 6 步：手机上"安装"

- **iPhone（Safari）**：打开网址 → 底部分享按钮 → **添加到主屏幕**
- **安卓（Chrome / Edge）**：打开网址 → 菜单 → **安装应用 / 添加到主屏幕**
  - 微信内置浏览器不支持添加到主屏幕，请用系统浏览器打开

之后从主屏幕图标打开，全屏显示，像原生 App 一样。在信号不好的地方也能打开、照常计时，训练记录联网后自动上传。

---

## 日常维护

| 要做什么 | 命令（在 `deploy/` 目录） |
|---|---|
| 发布新版本 | `./update.sh`（拉代码 → 重新构建 → 重启；数据库迁移自动执行） |
| 邀请新的内测用户 | 编辑 `.env` 的 `SIGNUP_ALLOWLIST`，然后 `docker compose up -d` |
| 看日志 | `docker compose logs -f app` |
| 备份数据库 | `./backup.sh`；建议加定时任务：`crontab -e` 加一行 `0 4 * * * cd /root/thinMuscleClub/deploy && ./backup.sh` |
| 重启 | `docker compose restart app` |

## 常见问题

**打不开 / 证书错误**：检查防火墙是否放行了 443；`docker compose logs caddy` 看证书申请日志。sslip.io 偶尔申请证书较慢，等一两分钟再刷新。

**收不到验证码**：`docker compose logs app` 里搜 `code send failed`。常见原因是授权码填错，或 QQ 邮箱 SMTP 服务没开。也看一下垃圾邮件箱。

**提示"内测中，暂未开放注册"**：这个邮箱不在 `SIGNUP_ALLOWLIST` 里。

**启动失败，日志里有"生产环境…"**：配置检查没通过，按提示补全 `.env`。

## 安全说明

- `.env` 里有数据库密码和密钥，权限已设为仅 root 可读，**不要提交到 Git**（已在 .gitignore 里）
- 数据库只在 Docker 内网可访问，不对公网开放
- 内测数据属于健康数据，请只邀请知情同意的朋友；正式上线前需要补全《隐私政策》和《健康数据处理说明》正文
