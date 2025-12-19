/**
 * Update Command
 *
 * CLI command to update catalog dependencies.
 * Supports interactive mode, dry-run, and various update strategies.
 */

import {
  AIAnalysisService,
  AnalysisType,
  CatalogUpdateService,
  FileSystemService,
  FileWorkspaceRepository,
  UpdateOptions,
  UpdatePlan,
  UpdateTarget,
  WorkspaceService,
} from '@pcu/core';
import { ConfigLoader } from '@pcu/utils';
import chalk from 'chalk';
import { OutputFormat, OutputFormatter } from '../formatters/outputFormatter.js';
import { ProgressBar } from '../formatters/progressBar.js';
import { InteractivePrompts } from '../interactive/interactivePrompts.js';
import { StyledText, ThemeManager } from '../themes/colorTheme.js';

export interface UpdateCommandOptions {
  workspace?: string;
  catalog?: string;
  format?: OutputFormat;
  target?: UpdateTarget;
  interactive?: boolean;
  dryRun?: boolean;
  force?: boolean;
  prerelease?: boolean;
  include?: string[];
  exclude?: string[];
  createBackup?: boolean;
  verbose?: boolean;
  color?: boolean;
  // AI batch analysis options
  ai?: boolean;
  provider?: string;
  analysisType?: AnalysisType;
  skipCache?: boolean;
}

export class UpdateCommand {
  private readonly updateService: CatalogUpdateService;

  constructor(updateService: CatalogUpdateService) {
    this.updateService = updateService;
  }

  /**
   * Execute the update command
   */
  async execute(options: UpdateCommandOptions = {}): Promise<void> {
    let progressBar: ProgressBar | undefined;

    try {
      // Initialize theme
      ThemeManager.setTheme('default');

      // Create progress bar for the update process
      progressBar = new ProgressBar({
        text: '正在规划更新...',
        total: 4, // 4 main steps
      });
      progressBar.start('正在加载工作区配置...');

      // Load configuration file first
      const config = ConfigLoader.loadConfig(options.workspace || process.cwd());

      // Use format from CLI options first, then config file, then default
      const effectiveFormat = options.format || config.defaults?.format || 'table';

      // Create output formatter with effective format
      const formatter = new OutputFormatter(
        effectiveFormat as OutputFormat,
        options.color !== false
      );

      // Merge CLI options with configuration file settings
      const updateOptions: UpdateOptions = {
        workspacePath: options.workspace,
        catalogName: options.catalog,
        target: options.target || config.defaults?.target,
        includePrerelease: options.prerelease ?? config.defaults?.includePrerelease ?? false,
        // CLI include/exclude options take priority over config file
        include: options.include?.length ? options.include : config.include,
        exclude: options.exclude?.length ? options.exclude : config.exclude,
        interactive: options.interactive ?? config.defaults?.interactive ?? false,
        dryRun: options.dryRun ?? config.defaults?.dryRun ?? false,
        force: options.force ?? false,
        createBackup: options.createBackup ?? config.defaults?.createBackup ?? false,
      };

      // Step 1: Planning updates
      progressBar.update('正在检查包版本...', 1, 4);
      const plan = await this.updateService.planUpdates(updateOptions);

      // Step 2: Check if any updates found
      progressBar.update('正在分析更新...', 2, 4);

      if (!plan.updates.length) {
        progressBar.succeed('所有依赖包都是最新的');
        console.log(StyledText.iconSuccess('All dependencies are up to date!'));
        return;
      }

      console.log(
        StyledText.iconPackage(
          `Found ${plan.totalUpdates} update${plan.totalUpdates === 1 ? '' : 's'} available`
        )
      );

      // Interactive selection if enabled
      let finalPlan = plan;
      if (options.interactive) {
        finalPlan = await this.interactiveSelection(plan);
        if (!finalPlan.updates.length) {
          progressBar.warn('未选择任何更新');
          console.log(StyledText.iconWarning('No updates selected'));
          return;
        }
      }

      // AI batch analysis if enabled - analyze ALL packages in one request
      if (options.ai) {
        progressBar.update('🤖 正在进行 AI 批量分析...', 2.5, 4);
        progressBar.stop();

        console.log(
          chalk.blue(
            `\n🤖 Running AI-powered batch analysis for ${finalPlan.updates.length} packages...`
          )
        );
        console.log(chalk.gray('This analyzes all packages in a single request for efficiency.\n'));

        try {
          const aiResult = await this.performBatchAIAnalysis(finalPlan, options);

          // Display AI analysis results
          console.log(chalk.blue('\n📊 AI Analysis Results:'));
          console.log(chalk.gray('─'.repeat(60)));
          console.log(chalk.cyan(`Provider: ${aiResult.provider}`));
          console.log(chalk.cyan(`Confidence: ${(aiResult.confidence * 100).toFixed(0)}%`));
          console.log(chalk.cyan(`Processing time: ${aiResult.processingTimeMs}ms`));
          console.log(chalk.gray('─'.repeat(60)));
          console.log(chalk.yellow('\n📝 Summary:'));
          console.log(aiResult.summary);

          // Display recommendations for each package
          if (aiResult.recommendations.length > 0) {
            console.log(chalk.yellow('\n📦 Package Recommendations:'));
            for (const rec of aiResult.recommendations) {
              const actionIcon =
                rec.action === 'update' ? '✅' : rec.action === 'skip' ? '❌' : '⚠️';
              const riskColor =
                rec.riskLevel === 'critical'
                  ? chalk.red
                  : rec.riskLevel === 'high'
                    ? chalk.yellow
                    : rec.riskLevel === 'medium'
                      ? chalk.cyan
                      : chalk.green;

              console.log(
                `\n  ${actionIcon} ${chalk.bold(rec.package)}: ${rec.currentVersion} → ${rec.targetVersion}`
              );
              console.log(
                `     Action: ${chalk.bold(rec.action.toUpperCase())} | Risk: ${riskColor(rec.riskLevel)}`
              );
              console.log(`     ${rec.reason}`);

              if (rec.breakingChanges && rec.breakingChanges.length > 0) {
                console.log(
                  chalk.red(`     ⚠️  Breaking changes: ${rec.breakingChanges.join(', ')}`)
                );
              }
              if (rec.securityFixes && rec.securityFixes.length > 0) {
                console.log(chalk.green(`     🔒 Security fixes: ${rec.securityFixes.join(', ')}`));
              }
            }
          }

          // Display warnings
          if (aiResult.warnings && aiResult.warnings.length > 0) {
            console.log(chalk.yellow('\n⚠️  Warnings:'));
            for (const warning of aiResult.warnings) {
              console.log(chalk.yellow(`  - ${warning}`));
            }
          }

          console.log(chalk.gray('\n' + '─'.repeat(60)));

          // If there are critical/skip recommendations, warn the user
          const skipRecommendations = aiResult.recommendations.filter((r) => r.action === 'skip');
          if (skipRecommendations.length > 0 && !options.force) {
            console.log(
              chalk.red(
                `\n⛔ AI recommends skipping ${skipRecommendations.length} package(s) due to risks.`
              )
            );
            console.log(chalk.yellow('Use --force to override AI recommendations.\n'));
          }
        } catch (aiError) {
          console.warn(
            chalk.yellow('\n⚠️  AI batch analysis failed, continuing without AI insights:')
          );
          if (options.verbose) {
            console.warn(chalk.gray(String(aiError)));
          }
        }

        // Restart progress bar
        progressBar = new ProgressBar({
          text: '准备应用更新...',
          total: 4,
        });
        progressBar.start('正在准备应用更新...');
      }

      // Step 3: Apply updates
      progressBar.update('正在准备应用更新...', 3, 4);

      if (!options.dryRun) {
        // Replace the progress bar with one for applying updates
        progressBar.stop();
        progressBar = new ProgressBar({
          text: 'Applying updates...',
          total: finalPlan.updates.length,
        });
        progressBar.start('正在应用更新...');

        const result = await this.updateService.executeUpdates(finalPlan, updateOptions);
        progressBar.succeed(`Applied ${finalPlan.updates.length} updates`);

        console.log(formatter.formatUpdateResult(result));
      } else {
        progressBar.update('正在生成预览...', 4, 4);
        progressBar.succeed('更新预览完成');
        console.log(StyledText.iconInfo('Dry run - no changes made'));
        console.log(JSON.stringify(finalPlan, null, 2));
      }

      console.log(StyledText.iconComplete('Update process completed!'));
    } catch (error) {
      if (progressBar) {
        progressBar.fail('Operation failed');
      }

      if (error instanceof Error) {
        console.error(StyledText.iconError(`Error: ${error.message}`));
      } else {
        console.error(StyledText.iconError('Unknown error occurred'));
      }
      throw error;
    }
  }

  /**
   * Interactive update selection
   */
  private async interactiveSelection(plan: UpdatePlan): Promise<UpdatePlan> {
    const interactivePrompts = new InteractivePrompts();

    // Transform PlannedUpdate to the format expected by InteractivePrompts
    const packages = plan.updates.map((update) => ({
      name: update.packageName,
      current: update.currentVersion,
      latest: update.newVersion,
      type: update.updateType,
    }));

    const selectedPackageNames = await interactivePrompts.selectPackages(packages);

    // Filter the plan to only include selected packages
    const selectedUpdates = plan.updates.filter((update) =>
      selectedPackageNames.includes(update.packageName)
    );

    return {
      ...plan,
      updates: selectedUpdates,
      totalUpdates: selectedUpdates.length,
    };
  }

  /**
   * Perform batch AI analysis for all packages in the update plan
   * This analyzes ALL packages in a single AI request for efficiency
   */
  private async performBatchAIAnalysis(plan: UpdatePlan, options: UpdateCommandOptions) {
    const workspacePath = options.workspace || process.cwd();

    // Create workspace service to get workspace info
    const fileSystemService = new FileSystemService();
    const workspaceRepository = new FileWorkspaceRepository(fileSystemService);
    const workspaceService = new WorkspaceService(workspaceRepository);
    const workspaceInfo = await workspaceService.getWorkspaceInfo(workspacePath);

    // Create AI service
    const aiService = new AIAnalysisService({
      config: {
        preferredProvider: options.provider === 'auto' ? 'auto' : options.provider,
        cache: { enabled: !options.skipCache, ttl: 3600 },
        fallback: { enabled: true, useRuleEngine: true },
      },
    });

    // Convert all planned updates to PackageUpdateInfo format for batch analysis
    const packages = plan.updates.map((update) => ({
      name: update.packageName,
      currentVersion: update.currentVersion,
      targetVersion: update.newVersion,
      updateType: update.updateType,
      catalogName: update.catalogName,
    }));

    // Build workspace info for AI
    const wsInfo = {
      name: workspaceInfo.name,
      path: workspaceInfo.path,
      packageCount: workspaceInfo.packageCount,
      catalogCount: workspaceInfo.catalogCount,
    };

    // Perform single batch analysis for ALL packages
    const result = await aiService.analyzeUpdates(packages, wsInfo, {
      analysisType: options.analysisType || 'impact',
      skipCache: options.skipCache,
    });

    return result;
  }

  /**
   * Validate command options
   */
  static validateOptions(options: UpdateCommandOptions): string[] {
    const errors: string[] = [];

    // Validate format
    if (options.format && !['table', 'json', 'yaml', 'minimal'].includes(options.format)) {
      errors.push('Invalid format. Must be one of: table, json, yaml, minimal');
    }

    // Validate target
    if (
      options.target &&
      !['latest', 'greatest', 'minor', 'patch', 'newest'].includes(options.target)
    ) {
      errors.push('Invalid target. Must be one of: latest, greatest, minor, patch, newest');
    }

    // Interactive and dry-run conflict
    if (options.interactive && options.dryRun) {
      errors.push('Cannot use --interactive with --dry-run');
    }

    return errors;
  }

  /**
   * Get command help text
   */
  static getHelpText(): string {
    return `
Update catalog dependencies

Usage:
  pcu update [options]

Options:
  --workspace <path>     Workspace directory (default: current directory)
  --catalog <name>       Update specific catalog only
  --format <type>        Output format: table, json, yaml, minimal (default: table)
  --target <type>        Update target: latest, greatest, minor, patch, newest (default: latest)
  -i, --interactive      Interactive mode to choose updates
  -d, --dry-run          Preview changes without writing files
  --force                Force updates even if conflicts exist
  --prerelease           Include prerelease versions
  --include <pattern>    Include packages matching pattern (can be used multiple times)
  --exclude <pattern>    Exclude packages matching pattern (can be used multiple times)
  --create-backup        Create backup files before updating
  --verbose              Show detailed information
  --no-color             Disable colored output

Examples:
  pcu update                          # Update all catalogs
  pcu update --interactive            # Interactive update selection
  pcu update --dry-run               # Preview updates without applying
  pcu update --catalog react17       # Update specific catalog
  pcu update --target minor          # Update to latest minor versions only
  pcu update --force                 # Force updates despite conflicts
  pcu update --include "react*"      # Update only React packages

Exit Codes:
  0  Updates completed successfully
  1  Updates failed or were cancelled
  2  Error occurred
    `;
  }
}
