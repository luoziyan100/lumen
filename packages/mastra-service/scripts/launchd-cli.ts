/**
 * [INPUT]: install/status/uninstall 命令与显式 Node、工程、数据根绝对路径
 * [OUTPUT]: 无凭证的部署 JSON 状态或简洁失败原因
 * [POS]: 新服务部署入口；默认正式 com.lumen.mastra；预览部署须显式指定独立 label
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { parseArgs } from 'node:util'
import { createLaunchdDeployment } from '../src/deployment/launchd.ts'

try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    node: { type: 'string' }, 'project-root': { type: 'string' }, 'data-root': { type: 'string' },
    label: { type: 'string' }, restart: { type: 'boolean', default: false },
  } })
  const command = positionals[0]
  if (positionals.length !== 1 || !['install', 'status', 'uninstall'].includes(command!) || !values.node || !values['project-root'] || !values['data-root']) {
    throw new Error('Usage: launchd-cli.ts <install|status|uninstall> --node /absolute/node --project-root /absolute/lumen --data-root /absolute/new-root [--label com.lumen.mastra] [--restart]')
  }
  if (values.restart && command !== 'install') throw new Error('--restart is only valid with install')
  const deployment = await createLaunchdDeployment({ nodePath: values.node, projectRoot: values['project-root'], dataRoot: values['data-root'], label: values.label })
  const result = command === 'install' ? await deployment.install({ restart: values.restart }) : command === 'uninstall' ? await deployment.uninstall() : await deployment.status()
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (result.state === 'conflict' || result.state === 'unhealthy') process.exitCode = 1
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Deployment failed'}\n`)
  process.exitCode = 1
}
