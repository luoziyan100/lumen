/**
 * [INPUT]: launchd.ts
 * [OUTPUT]: CLI — install | uninstall | status
 * [POS]: npm run launchd:* 入口
 * [PROTOCOL]: 变更时更新此头部,然后检查 CLAUDE.md
 */
import {
  installLaunchAgent,
  uninstallLaunchAgent,
  launchAgentStatus,
  LAUNCH_AGENT_LABEL,
} from '../src/launchd.ts'

const cmd = process.argv[2] ?? 'status'

try {
  if (cmd === 'install') {
    const paths = installLaunchAgent()
    console.log(`[lumen] LaunchAgent 已安装: ${LAUNCH_AGENT_LABEL}`)
    console.log(`  plist: ${paths.plistPath}`)
    console.log(`  node:  ${paths.node}`)
    console.log(`  entry: ${paths.serviceEntry}`)
    console.log(`  logs:  ${paths.logDir}`)
  } else if (cmd === 'uninstall') {
    uninstallLaunchAgent()
    console.log(`[lumen] LaunchAgent 已卸载: ${LAUNCH_AGENT_LABEL}`)
  } else if (cmd === 'status') {
    const s = launchAgentStatus()
    console.log(JSON.stringify(s, null, 2))
  } else {
    console.error(`用法: launchd-cli.ts <install|uninstall|status>`)
    process.exit(2)
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
}
