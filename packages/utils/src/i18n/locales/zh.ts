/**
 * Chinese Translations (简体中文)
 */

import type { TranslationDictionary } from '../types.js'

export const zh: TranslationDictionary = {
  // Error messages
  'error.packageNotFound': '包 "{{packageName}}" 在 npm registry 中不存在',
  'error.packageNotFoundWithSuggestion': '包 "{{packageName}}" 不存在',
  'error.possiblePackageNames': '可能的正确包名:',
  'error.checkPackageName': '请检查包名是否正确，或者该包可能已被移除',
  'error.emptyVersion': '包 "{{packageName}}" 的版本信息为空',
  'error.emptyVersionReasons':
    '这可能是由于:\n   • 包的 package.json 配置问题\n   • catalog 配置中的版本格式错误\n   • npm registry 数据同步问题',
  'error.networkError': '检查包 "{{packageName}}" 时遇到网络问题',
  'error.networkRetry': '请稍后重试，或检查网络连接',
  'error.registryError': '包 "{{packageName}}" 的注册表错误：{{message}}',
  'error.workspaceNotFound': '在 "{{path}}" 未找到 pnpm 工作区',
  'error.catalogNotFound': '未找到目录 "{{catalogName}}"',
  'error.invalidVersion': '无效的版本 "{{version}}"',
  'error.invalidVersionRange': '无效的版本范围 "{{range}}"',
  'error.configurationError': '配置错误：{{message}}',
  'error.fileSystemError': '文件系统错误：{{message}}',
  'error.cacheError': '缓存错误：{{message}}',
  'error.securityCheckFailed': '包 "{{packageName}}" 安全检查失败：{{message}}',
  'error.securityCheckUnavailable': '无法检查 "{{packageName}}" 的安全状态',
  'error.updateFailed': '更新失败：{{message}}',
  'error.packageSkipped': '跳过包 "{{packageName}}" (检查失败)',
  'error.unknown': '发生未知错误',

  // Success messages
  'success.updateComplete': '更新成功完成',
  'success.cacheCleared': '缓存已成功清除',
  'success.configInitialized': '配置初始化成功',
  'success.validationPassed': '所有验证已通过',

  // Info messages
  'info.checkingUpdates': '正在检查过时的 catalog 依赖',
  'info.foundOutdated': '发现 {{count}} 个过时的依赖',
  'info.noUpdatesFound': '所有 catalog 依赖都是最新的！',
  'info.runWithUpdate': '使用 --update 参数来应用更新',
  'info.majorWarning': '主版本更新可能包含破坏性变更',
  'info.securityUpdates': '有 {{count}} 个安全更新可用',

  // Warning messages
  'warning.configExists': '配置文件已存在',
  'warning.workspaceNotDetected': '未检测到 PNPM 工作区结构',
  'warning.deprecatedPackage': '包 "{{packageName}}" 已被弃用',

  // Summary messages
  'summary.skippedPackages': '跳过了 {{count}} 个包的检查:',
  'summary.notFoundPackages': '不存在的包 ({{count}}): {{packages}}',
  'summary.emptyVersionPackages': '版本信息为空 ({{count}}): {{packages}}',
  'summary.networkIssuePackages': '网络问题 ({{count}}): {{packages}}',
  'summary.otherIssuePackages': '其他问题 ({{count}}): {{packages}}',
  'summary.securityCheckFailures': '安全检查失败: {{count}} 次',

  // Command messages
  'command.workspace.title': '工作区',
  'command.workspace.path': '路径',
  'command.workspace.packages': '包数量',
  'command.workspace.catalogs': '目录数量',
  'command.workspace.catalogNames': '目录名称',
  'command.check.analyzing': '正在分析 catalog 依赖...',
  'command.check.summary': '摘要',
  'command.check.majorUpdates': '{{count}} 个主版本更新',
  'command.check.minorUpdates': '{{count}} 个次版本更新',
  'command.check.patchUpdates': '{{count}} 个补丁更新',
  'command.init.creating': '正在创建 PCU 配置...',
  'command.init.success': 'PCU 配置初始化成功！',
  'command.init.nextSteps': '下一步',
}
