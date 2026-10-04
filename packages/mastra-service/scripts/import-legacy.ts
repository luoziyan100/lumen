/**
 * [INPUT]: 显式 --source-root/--target-root、逐项目 copy/bind 映射和离线迁移器
 * [OUTPUT]: 默认 dry-run JSON 清单；仅 --apply 发布新数据根
 * [POS]: 人工运行的一次性迁移 CLI，不自动使用正式用户目录
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { parseArgs } from 'node:util'
import { importLegacyData, MigrationBlockedError } from '../src/migration/importer.ts'
import type { LibraryOption } from '../src/migration/types.ts'

function mappings(values: string[], mode: LibraryOption['mode']): LibraryOption[] {
  return values.map(value => {
    const separator = value.indexOf('=')
    if (separator < 1 || !value.slice(separator + 1)) throw new Error('Source mapping must be PROJECT_ID=/absolute/configured/source')
    return { projectId: value.slice(0, separator), sourcePath: value.slice(separator + 1), mode }
  })
}

async function main() {
  const { values } = parseArgs({ options: { 'source-root': { type: 'string' }, 'target-root': { type: 'string' },
    'copy-source': { type: 'string', multiple: true }, 'bind-source': { type: 'string', multiple: true },
    apply: { type: 'boolean', default: false }, 'dry-run': { type: 'boolean', default: false } } })
  if (!values['source-root'] || !values['target-root'] || (values.apply && values['dry-run']))
    throw new Error('Use --source-root /absolute/legacy --target-root /absolute/new [--apply | --dry-run] [--copy-source PROJECT_ID=/absolute/source | --bind-source PROJECT_ID=/absolute/source]')
  const libraries = [...mappings(values['copy-source'] ?? [], 'copy'), ...mappings(values['bind-source'] ?? [], 'bind')]
  const report = await importLegacyData({ sourceRoot: values['source-root'], targetRoot: values['target-root'], dryRun: !values.apply, libraries })
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  if (!report.ready) process.exitCode = 2
}

main().catch(error => {
  if (error instanceof MigrationBlockedError) process.stderr.write(JSON.stringify(error.report, null, 2) + '\n')
  else process.stderr.write(`${error instanceof Error ? error.message : 'Migration failed'}\n`)
  process.exitCode = 1
})
