# LaunchAgent 本机验收

> 非正式 CI;开发机手工跑。对应 `src/launchd.ts` + `scripts/launchd-cli.ts`。

## 安装

```bash
npm run launchd:install -w packages/agent-service
npm run launchd:status -w packages/agent-service
# 期望:plistInstalled true, portfileAlive true, port 8787
```

## KeepAlive

```bash
PID=$(python3 -c "import json;print(json.load(open('$HOME/.lumen/agent-service.json'))['pid'])")
kill "$PID"
# 等 5–15s
npm run launchd:status -w packages/agent-service
# 期望:新 pid,仍 portfileAlive
```

## 与 App 契约

- Cmd+Q 退出 Lumen.app 后 `launchd:status` 仍应 alive。
- 设置 → 后台服务 → 关闭常驻 → plist 消失;再开可恢复。

## 卸载

```bash
npm run launchd:uninstall -w packages/agent-service
```
