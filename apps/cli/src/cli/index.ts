#!/usr/bin/env node

/**
 * pnpm-catalog-updates CLI Entry Point
 *
 * A CLI tool for checking and updating pnpm workspace catalog dependencies.
 * This is the main entry point that handles command parsing and execution.
 */

import { dirname, join } from 'path';
import { OutputFormat, OutputFormatter } from './formatters/outputFormatter.js';

// Services and Dependencies
import type { AnalysisType } from '@pcu/core';
import {
  AIAnalysisService,
  AIDetector,
  CatalogUpdateService,
  FileSystemService,
  FileWorkspaceRepository,
  NpmRegistryService,
  WorkspaceService,
} from '@pcu/core';
// CLI Commands
import { ConfigLoader, VersionChecker } from '@pcu/utils';
import chalk from 'chalk';
import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { CheckCommand } from './commands/checkCommand.js';
import { InitCommand } from './commands/initCommand.js';
import { SecurityCommand } from './commands/securityCommand.js';
import { UpdateCommand } from './commands/updateCommand.js';
import { InteractivePrompts } from './interactive/interactivePrompts.js';
import { StyledText, ThemeManager } from './themes/colorTheme.js';

// Get package.json for version info
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

/**
 * Create service dependencies with configuration support
 */
function createServices(workspacePath?: string) {
  const fileSystemService = new FileSystemService();
  const workspaceRepository = new FileWorkspaceRepository(fileSystemService);
  // Use factory method to create CatalogUpdateService with configuration
  const catalogUpdateService = CatalogUpdateService.createWithConfig(
    workspaceRepository,
    workspacePath
  );
  const workspaceService = new WorkspaceService(workspaceRepository);

  return {
    fileSystemService,
    workspaceRepository,
    catalogUpdateService,
    workspaceService,
  };
}

function parseBooleanFlag(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '') return false;
    if (['false', '0', 'no', 'off', 'n'].includes(normalized)) return false;
    if (['true', '1', 'yes', 'on', 'y'].includes(normalized)) return true;
    // Commander env() 会把任意非空字符串塞进来；未知字符串按“启用”处理
    return true;
  }
  return Boolean(value);
}

/**
 * Main CLI function
 */
export async function main(): Promise<void> {
  const program = new Command();

  // Parse arguments first to get workspace path
  let workspacePath: string | undefined;

  // Extract workspace path from arguments for service creation
  const workspaceIndex = process.argv.findIndex((arg) => arg === '-w' || arg === '--workspace');
  if (workspaceIndex !== -1 && workspaceIndex + 1 < process.argv.length) {
    workspacePath = process.argv[workspaceIndex + 1];
  }

  // Load configuration to check if version updates are enabled
  const config = ConfigLoader.loadConfig(workspacePath || process.cwd());

  // Check for version updates (skip in CI environments or if disabled)
  if (VersionChecker.shouldCheckForUpdates() && config.advanced?.checkForUpdates !== false) {
    try {
      const versionResult = await VersionChecker.checkVersion(packageJson.version, {
        skipPrompt: false,
        timeout: 3000, // Short timeout to not delay CLI startup
      });

      if (versionResult.shouldPrompt) {
        const didUpdate = await VersionChecker.promptAndUpdate(versionResult);
        if (didUpdate) {
          // Exit after successful update to allow user to restart with new version
          console.log(chalk.blue('Please run your command again to use the updated version.'));
          process.exit(0);
        }
      }
    } catch (error) {
      // Silently fail version check to not interrupt CLI usage (only show warning in verbose mode)
      if (process.argv.includes('-v') || process.argv.includes('--verbose')) {
        console.warn(chalk.yellow('⚠️  Could not check for updates:'), error);
      }
    }
  }

  // Create services with workspace path for configuration loading
  const services = createServices(workspacePath);

  // Configure the main command
  program
    .name('pcu')
    .description('A CLI tool to check and update pnpm workspace catalog dependencies')
    .option('--version', 'show version information')
    .option('-v, --verbose', 'enable verbose logging')
    .option('-w, --workspace <path>', 'workspace directory path')
    .option('--no-color', 'disable colored output')
    .option('-u, --update', 'shorthand for update command')
    .option('-c, --check', 'shorthand for check command')
    .option('-a, --analyze', 'shorthand for analyze command')
    .option('-s, --workspace-info', 'shorthand for workspace command')
    .option('-t, --theme', 'shorthand for theme command')
    .option('--security-audit', 'shorthand for security command')
    .option('--security-fix', 'shorthand for security --fix-vulns command');

  // Check command
  program
    .command('check')
    .alias('chk')
    .description('check for outdated catalog dependencies')
    .option('--catalog <name>', 'check specific catalog only')
    .option('-f, --format <type>', 'output format: table, json, yaml, minimal', 'table')
    .option(
      '-t, --target <type>',
      'update target: latest, greatest, minor, patch, newest',
      'latest'
    )
    .option('--prerelease', 'include prerelease versions')
    .option('--include <pattern>', 'include packages matching pattern', [])
    .option('--exclude <pattern>', 'exclude packages matching pattern', [])
    .action(async (options, command) => {
      try {
        const globalOptions = command.parent.opts();
        const checkCommand = new CheckCommand(services.catalogUpdateService);

        await checkCommand.execute({
          workspace: globalOptions.workspace,
          catalog: options.catalog,
          format: options.format,
          target: options.target,
          prerelease: options.prerelease,
          include: Array.isArray(options.include)
            ? options.include
            : [options.include].filter(Boolean),
          exclude: Array.isArray(options.exclude)
            ? options.exclude
            : [options.exclude].filter(Boolean),
          verbose: globalOptions.verbose,
          color: !globalOptions.noColor,
        });
      } catch (error) {
        console.error(chalk.red('❌ Error:'), error);
        process.exit(1);
      }
    });

  // Update command
  program
    .command('update')
    .alias('u')
    .description('update catalog dependencies')
    .option('-i, --interactive', 'interactive mode to choose updates')
    .option('-d, --dry-run', 'preview changes without writing files')
    .option(
      '-t, --target <type>',
      'update target: latest, greatest, minor, patch, newest',
      'latest'
    )
    .option('--catalog <name>', 'update specific catalog only')
    .option('--include <pattern>', 'include packages matching pattern', [])
    .option('--exclude <pattern>', 'exclude packages matching pattern', [])
    .option('--force', 'force updates even if risky')
    .option('--prerelease', 'include prerelease versions')
    .option('-b, --create-backup', 'create backup files before updating')
    .option('-f, --format <type>', 'output format: table, json, yaml, minimal', 'table')
    .action(async (options, command) => {
      try {
        const globalOptions = command.parent.opts();
        const updateCommand = new UpdateCommand(services.catalogUpdateService);

        await updateCommand.execute({
          workspace: globalOptions.workspace,
          catalog: options.catalog,
          format: options.format,
          target: options.target,
          interactive: options.interactive,
          dryRun: options.dryRun,
          force: options.force,
          prerelease: options.prerelease,
          include: Array.isArray(options.include)
            ? options.include
            : [options.include].filter(Boolean),
          exclude: Array.isArray(options.exclude)
            ? options.exclude
            : [options.exclude].filter(Boolean),
          createBackup: options.createBackup,
          verbose: globalOptions.verbose,
          color: !globalOptions.noColor,
        });
      } catch (error) {
        console.error(chalk.red('❌ Error:'), error);
        process.exit(1);
      }
    });

  // Analyze command
  program
    .command('analyze')
    .alias('a')
    .description('analyze the impact of updating a specific dependency')
    .argument('<catalog>', 'catalog name')
    .argument('<package>', 'package name')
    .argument('[version]', 'new version (default: latest)')
    .option('-f, --format <type>', 'output format: table, json, yaml, minimal', 'table')
    .option('--ai', 'enable AI-powered analysis')
    .option('--provider <name>', 'AI provider: auto, claude, gemini, codex', 'auto')
    .option(
      '--analysis-type <type>',
      'AI analysis type: impact, security, compatibility, recommend',
      'impact'
    )
    .option('--skip-cache', 'skip AI analysis cache')
    .action(async (catalog, packageName, version, options, command) => {
      try {
        const globalOptions = command.parent.opts();
        const formatter = new OutputFormatter(
          options.format as OutputFormat,
          !globalOptions.noColor
        );

        // Get latest version if not specified
        let targetVersion = version;
        if (!targetVersion) {
          // Create a temporary registry service for version fetching
          const tempRegistryService = new NpmRegistryService();
          targetVersion = (await tempRegistryService.getLatestVersion(packageName)).toString();
        }

        // Get basic impact analysis first
        const analysis = await services.catalogUpdateService.analyzeImpact(
          catalog,
          packageName,
          targetVersion,
          globalOptions.workspace
        );

        // If AI analysis is enabled, perform AI-powered analysis
        if (parseBooleanFlag(options.ai)) {
          console.log(chalk.blue('🤖 Running AI-powered analysis...'));

          const aiService = new AIAnalysisService({
            config: {
              preferredProvider: options.provider === 'auto' ? 'auto' : options.provider,
              cache: { enabled: !parseBooleanFlag(options.skipCache), ttl: 3600 },
              fallback: { enabled: true, useRuleEngine: true },
            },
          });

          // Get workspace info
          const workspaceInfo = await services.workspaceService.getWorkspaceInfo(
            globalOptions.workspace
          );

          // Build packages info for AI analysis
          const packages = [
            {
              name: packageName,
              currentVersion: analysis.currentVersion,
              targetVersion: analysis.proposedVersion,
              updateType: analysis.updateType,
            },
          ];

          // Build workspace info for AI
          const wsInfo = {
            name: workspaceInfo.name,
            path: workspaceInfo.path,
            packageCount: workspaceInfo.packageCount,
            catalogCount: workspaceInfo.catalogCount,
          };

          try {
            const aiResult = await aiService.analyzeUpdates(packages, wsInfo, {
              analysisType: options.analysisType as AnalysisType,
              skipCache: parseBooleanFlag(options.skipCache),
            });

            // Format and display AI analysis result
            const aiOutput = formatter.formatAIAnalysis(aiResult, analysis);
            console.log(aiOutput);
            // Ensure process exits after AI analysis to avoid hanging
            process.exit(0);
          } catch (aiError) {
            console.warn(chalk.yellow('⚠️  AI analysis failed, showing basic analysis:'));
            if (globalOptions.verbose) {
              console.warn(chalk.gray(String(aiError)));
            }
            // Fall back to basic analysis
            const formattedOutput = formatter.formatImpactAnalysis(analysis);
            console.log(formattedOutput);
            process.exit(0);
          }
        } else {
          // Standard analysis without AI
          const formattedOutput = formatter.formatImpactAnalysis(analysis);
          console.log(formattedOutput);
        }
      } catch (error) {
        console.error(chalk.red('❌ Error:'), error);
        process.exit(1);
      }
    });

  // Workspace command
  program
    .command('workspace')
    .alias('w')
    .description('workspace information and validation')
    .option('--validate', 'validate workspace configuration')
    .option('-s, --stats', 'show workspace statistics')
    .option('-f, --format <type>', 'output format: table, json, yaml, minimal', 'table')
    .action(async (options, command) => {
      try {
        const globalOptions = command.parent.opts();
        const formatter = new OutputFormatter(
          options.format as OutputFormat,
          !globalOptions.noColor
        );

        if (options.validate) {
          const report = await services.workspaceService.validateWorkspace(globalOptions.workspace);
          const formattedOutput = formatter.formatValidationReport(report);
          console.log(formattedOutput);
          process.exit(report.isValid ? 0 : 1);
        } else if (options.stats) {
          const stats = await services.workspaceService.getWorkspaceStats(globalOptions.workspace);
          const formattedOutput = formatter.formatWorkspaceStats(stats);
          console.log(formattedOutput);
        } else {
          const info = await services.workspaceService.getWorkspaceInfo(globalOptions.workspace);
          console.log(formatter.formatMessage(`Workspace: ${info.name}`, 'info'));
          console.log(formatter.formatMessage(`Path: ${info.path}`, 'info'));
          console.log(formatter.formatMessage(`Packages: ${info.packageCount}`, 'info'));
          console.log(formatter.formatMessage(`Catalogs: ${info.catalogCount}`, 'info'));

          if (info.catalogNames.length > 0) {
            console.log(
              formatter.formatMessage(`Catalog names: ${info.catalogNames.join(', ')}`, 'info')
            );
          }
        }
      } catch (error) {
        console.error(chalk.red('❌ Error:'), error);
        process.exit(1);
      }
    });

  // Theme command
  program
    .command('theme')
    .alias('t')
    .description('configure color theme')
    .option('-s, --set <theme>', 'set theme: default, modern, minimal, neon')
    .option('-l, --list', 'list available themes')
    .option('-i, --interactive', 'interactive theme selection')
    .action(async (options, _command) => {
      try {
        if (options.list) {
          const themes = ThemeManager.listThemes();
          console.log(StyledText.iconInfo('Available themes:'));
          themes.forEach((theme) => {
            console.log(`  • ${theme}`);
          });
          return;
        }

        if (options.set) {
          const themes = ThemeManager.listThemes();
          if (!themes.includes(options.set)) {
            console.error(StyledText.iconError(`Invalid theme: ${options.set}`));
            console.log(StyledText.muted(`Available themes: ${themes.join(', ')}`));
            process.exit(1);
          }

          ThemeManager.setTheme(options.set);
          console.log(StyledText.iconSuccess(`Theme set to: ${options.set}`));

          // Show a preview
          console.log('\nTheme preview:');
          const theme = ThemeManager.getTheme();
          console.log(`  ${theme.success('✓ Success message')}`);
          console.log(`  ${theme.warning('⚠ Warning message')}`);
          console.log(`  ${theme.error('✗ Error message')}`);
          console.log(`  ${theme.info('ℹ Info message')}`);
          console.log(
            `  ${theme.major('Major update')} | ${theme.minor('Minor update')} | ${theme.patch('Patch update')}`
          );
          return;
        }

        if (options.interactive) {
          const interactivePrompts = new InteractivePrompts();
          const config = await interactivePrompts.configurationWizard();

          if (config.theme) {
            ThemeManager.setTheme(config.theme);
            console.log(StyledText.iconSuccess(`Theme configured: ${config.theme}`));
          }
          return;
        }

        // Default: show current theme and list
        const currentTheme = ThemeManager.getTheme();
        console.log(StyledText.iconInfo('Current theme settings:'));
        console.log(`  Theme: ${currentTheme ? 'custom' : 'default'}`);
        console.log('\nAvailable themes:');
        ThemeManager.listThemes().forEach((theme) => {
          console.log(`  • ${theme}`);
        });
        console.log(
          StyledText.muted('\nUse --set <theme> to change theme or --interactive for guided setup')
        );
      } catch (error) {
        console.error(StyledText.iconError('Error configuring theme:'), error);
        process.exit(1);
      }
    });

  // Security command
  program
    .command('security')
    .alias('sec')
    .description('security vulnerability scanning and automated fixes')
    .option('-f, --format <type>', 'output format: table, json, yaml, minimal', 'table')
    .option('--audit', 'perform npm audit scan (default: true)', true)
    .option('--fix-vulns', 'automatically fix vulnerabilities')
    .option('--severity <level>', 'filter by severity: low, moderate, high, critical')
    .option('--include-dev', 'include dev dependencies in scan')
    .option('--snyk', 'include Snyk scan (requires snyk CLI)')
    .action(async (options, command) => {
      try {
        const globalOptions = command.parent.opts();
        const formatter = new OutputFormatter(
          options.format as OutputFormat,
          !globalOptions.noColor
        );

        const securityCommand = new SecurityCommand(formatter);

        await securityCommand.execute({
          workspace: globalOptions.workspace,
          format: options.format,
          audit: options.audit,
          fixVulns: options.fixVulns,
          severity: options.severity,
          includeDev: options.includeDev,
          snyk: options.snyk,
          verbose: globalOptions.verbose,
          color: !globalOptions.noColor,
        });
      } catch (error) {
        console.error(chalk.red('❌ Error:'), error);
        process.exit(1);
      }
    });

  // Init command
  program
    .command('init')
    .alias('i')
    .description('initialize PCU configuration and PNPM workspace')
    .option('--force', 'overwrite existing configuration file')
    .option('--full', 'generate full configuration with all options')
    .option(
      '--create-workspace',
      'create PNPM workspace structure if missing (default: true)',
      true
    )
    .option('--no-create-workspace', 'skip creating PNPM workspace structure')
    .option('-f, --format <type>', 'output format: table, json, yaml, minimal', 'table')
    .action(async (options, command) => {
      try {
        const globalOptions = command.parent.opts();
        const initCommand = new InitCommand();

        await initCommand.execute({
          workspace: globalOptions.workspace,
          force: options.force,
          full: options.full,
          createWorkspace: options.createWorkspace,
          verbose: globalOptions.verbose,
          color: !globalOptions.noColor,
        });
      } catch (error) {
        console.error(chalk.red('❌ Error:'), error);
        process.exit(1);
      }
    });

  // AI command - check AI provider status and availability
  program
    .command('ai')
    .description('check AI provider status and availability')
    .option('--status', 'show status of all AI providers (default)')
    .option('--test', 'test AI analysis with a sample request')
    .option('--cache-stats', 'show AI analysis cache statistics')
    .option('--clear-cache', 'clear AI analysis cache')
    .action(async (options) => {
      try {
        const aiDetector = new AIDetector();

        if (options.clearCache) {
          // Import the cache singleton
          const { analysisCache } = await import('@pcu/core');
          analysisCache.clear();
          console.log(chalk.green('✅ AI analysis cache cleared'));
          process.exit(0);
        }

        if (options.cacheStats) {
          const { analysisCache } = await import('@pcu/core');
          const stats = analysisCache.getStats();
          console.log(chalk.blue('📊 AI Analysis Cache Statistics'));
          console.log(chalk.gray('─────────────────────────────────'));
          console.log(`  Total entries: ${chalk.cyan(stats.totalEntries)}`);
          console.log(`  Cache hits:    ${chalk.green(stats.hits)}`);
          console.log(`  Cache misses:  ${chalk.yellow(stats.misses)}`);
          console.log(`  Hit rate:      ${chalk.cyan((stats.hitRate * 100).toFixed(1) + '%')}`);
          process.exit(0);
        }

        if (options.test) {
          console.log(chalk.blue('🧪 Testing AI analysis...'));

          const aiService = new AIAnalysisService({
            config: {
              fallback: { enabled: true, useRuleEngine: true },
            },
          });

          const testPackages = [
            {
              name: 'lodash',
              currentVersion: '4.17.20',
              targetVersion: '4.17.21',
              updateType: 'patch' as const,
            },
          ];

          const testWorkspaceInfo = {
            name: 'test-workspace',
            path: process.cwd(),
            packageCount: 1,
            catalogCount: 1,
          };

          try {
            const result = await aiService.analyzeUpdates(testPackages, testWorkspaceInfo, {
              analysisType: 'impact',
            });
            console.log(chalk.green('✅ AI analysis test successful!'));
            console.log(chalk.gray('─────────────────────────────────'));
            console.log(`  Provider: ${chalk.cyan(result.provider)}`);
            console.log(`  Confidence: ${chalk.cyan((result.confidence * 100).toFixed(0) + '%')}`);
            console.log(`  Summary: ${result.summary}`);
          } catch (error) {
            console.log(chalk.yellow('⚠️  AI analysis test failed:'));
            console.log(chalk.gray(String(error)));
          }
          process.exit(0);
        }

        // Default: show status
        console.log(chalk.blue('🤖 AI Provider Status'));
        console.log(chalk.gray('─────────────────────────────────'));

        const summary = await aiDetector.getDetectionSummary();
        console.log(summary);

        const providers = await aiDetector.detectAvailableProviders();
        console.log('');
        console.log(chalk.blue('📋 Provider Details'));
        console.log(chalk.gray('─────────────────────────────────'));

        for (const provider of providers) {
          const statusIcon = provider.available ? chalk.green('✓') : chalk.red('✗');
          const statusText = provider.available
            ? chalk.green('Available')
            : chalk.gray('Not found');
          const priorityText = chalk.gray(`(priority: ${provider.priority})`);

          console.log(
            `  ${statusIcon} ${chalk.cyan(provider.name)} - ${statusText} ${priorityText}`
          );

          if (provider.available && provider.path) {
            console.log(chalk.gray(`      Path: ${provider.path}`));
          }
          if (provider.available && provider.version) {
            console.log(chalk.gray(`      Version: ${provider.version}`));
          }
        }

        const best = await aiDetector.getBestProvider();
        if (best) {
          console.log('');
          console.log(chalk.green(`✨ Best available provider: ${best.name}`));
        } else {
          console.log('');
          console.log(
            chalk.yellow('⚠️  No AI providers available. Rule-based fallback will be used.')
          );
          console.log(
            chalk.gray('   Install claude, gemini, or codex CLI for AI-powered analysis.')
          );
        }
        // Ensure process exits after async operations complete
        process.exit(0);
      } catch (error) {
        console.error(chalk.red('❌ Error:'), error);
        process.exit(1);
      }
    });

  // Add help command
  program
    .command('help')
    .alias('h')
    .argument('[command]', 'command to get help for')
    .description('display help for command')
    .action((command) => {
      if (command) {
        const cmd = program.commands.find((c) => c.name() === command);
        if (cmd) {
          cmd.help();
        } else {
          console.log(chalk.red(`Unknown command: ${command}`));
        }
      } else {
        program.help();
      }
    });

  // Let commander handle help and version normally
  // program.exitOverride() removed to fix help/version output

  // Handle shorthand options and single-letter commands by rewriting arguments
  const args = [...process.argv];
  // Map single-letter command 'i' -> init (changed from interactive mode)
  if (
    args.includes('i') &&
    !args.some(
      (a) =>
        a === 'init' ||
        a === 'update' ||
        a === '-u' ||
        a === '--update' ||
        a === '-i' ||
        a === '--interactive'
    )
  ) {
    const index = args.findIndex((arg) => arg === 'i');
    args.splice(index, 1, 'init');
  }

  if (args.includes('-u') || args.includes('--update')) {
    const index = args.findIndex((arg) => arg === '-u' || arg === '--update');
    args.splice(index, 1, 'update');
  } else if (
    (args.includes('-i') || args.includes('--interactive')) &&
    !args.some((a) => a === 'update' || a === '-u' || a === '--update')
  ) {
    // Map standalone -i to `update -i`
    const index = args.findIndex((arg) => arg === '-i' || arg === '--interactive');
    // Replace the flag position with 'update' and keep the flag after it
    args.splice(index, 1, 'update', '-i');
  } else if (args.includes('-c') || args.includes('--check')) {
    const index = args.findIndex((arg) => arg === '-c' || arg === '--check');
    args.splice(index, 1, 'check');
  } else if (args.includes('-a') || args.includes('--analyze')) {
    const index = args.findIndex((arg) => arg === '-a' || arg === '--analyze');
    args.splice(index, 1, 'analyze');
  } else if (args.includes('-s') || args.includes('--workspace-info')) {
    const index = args.findIndex((arg) => arg === '-s' || arg === '--workspace-info');
    args.splice(index, 1, 'workspace');
  } else if (args.includes('-t') || args.includes('--theme')) {
    const index = args.findIndex((arg) => arg === '-t' || arg === '--theme');
    args.splice(index, 1, 'theme');
  } else if (args.includes('--security-audit')) {
    const index = args.findIndex((arg) => arg === '--security-audit');
    args.splice(index, 1, 'security');
  } else if (args.includes('--security-fix')) {
    const index = args.findIndex((arg) => arg === '--security-fix');
    args.splice(index, 1, 'security', '--fix-vulns');
  }

  // Show help if no arguments provided
  if (args.length <= 2) {
    program.help();
  }

  // Handle custom --version with update checking
  if (args.includes('--version')) {
    console.log(packageJson.version);

    // Check for updates if not in CI and enabled in config
    if (VersionChecker.shouldCheckForUpdates() && config.advanced?.checkForUpdates !== false) {
      try {
        console.log(chalk.gray('Checking for updates...'));
        const versionResult = await VersionChecker.checkVersion(packageJson.version, {
          skipPrompt: false,
          timeout: 5000, // Longer timeout for explicit version check
        });

        if (versionResult.shouldPrompt) {
          const didUpdate = await VersionChecker.promptAndUpdate(versionResult);
          if (didUpdate) {
            console.log(chalk.blue('Please run your command again to use the updated version.'));
            process.exit(0);
          }
        } else if (versionResult.isLatest) {
          console.log(chalk.green('You are using the latest version!'));
        }
      } catch (error) {
        // Silently fail update check for version command
        if (args.includes('-v') || args.includes('--verbose')) {
          console.warn(chalk.yellow('⚠️  Could not check for updates:'), error);
        }
      }
    }

    process.exit(0);
  }

  // Parse command line arguments
  try {
    await program.parseAsync(args);
  } catch (error) {
    console.error(chalk.red('❌ Unexpected error:'), error);
    if (error instanceof Error && error.stack) {
      console.error(chalk.gray(error.stack));
    }
    process.exit(1);
  }
}

// Run the CLI if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(chalk.red('❌ Fatal error:'), error);
    process.exit(1);
  });
}
