# pcu

[![npm version](https://img.shields.io/npm/v/pcu.svg)](https://www.npmjs.com/package/pcu)
[![npm downloads](https://img.shields.io/npm/dm/pcu.svg)](https://www.npmjs.com/package/pcu)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)

A powerful CLI tool for managing pnpm workspace catalog dependencies with ease.

**Complete Documentation**: [https://pcu-cli.dev](https://pcu-cli.dev/en)

## Quick Start

### Installation

```bash
# Install globally
npm install -g pcu

# Or use with pnpm
pnpm add -g pcu

# Or use legacy package name
npm install -g pnpm-catalog-updates
```

### Usage

```bash
# Check for outdated catalog dependencies
pcu check
# or
pcu -c

# Update catalog dependencies interactively
pcu update --interactive
# or
pcu -i

# Update to latest versions
pcu update
# or
pcu -u
```

### Hybrid Mode

PCU features **Hybrid Mode** - when you run any command without flags, it automatically enters interactive mode to guide you through the options:

```bash
# No flags = Interactive prompts
pcu check        # Prompts for format, target, filter options
pcu update       # Prompts for catalog, format, target, etc.
pcu security     # Prompts for output format, severity filter

# With flags = Direct execution
pcu check --format table    # Runs directly with specified options
pcu update --target minor   # Runs directly with specified options

# Analyze impact of updates
pcu analyze
# or
pcu -a

# Show workspace information
pcu workspace
# or
pcu -s

# AI-powered analysis (NEW!)
pcu ai              # Check available AI providers
pcu update --ai     # Update with AI recommendations
pcu analyze react   # Analyze package with AI
```

### AI Analysis

PCU integrates with AI CLI tools (Gemini, Claude, Codex, Cursor) to provide:

- **Impact Analysis**: Understand how updates affect your code
- **Security Assessment**: AI-powered vulnerability analysis
- **Breaking Change Detection**: Detect potential compatibility issues
- **Update Recommendations**: Get intelligent suggestions for safe updates

```bash
# Check available AI providers
pcu ai

# Update with AI-powered analysis
pcu update --ai --interactive

# Analyze a specific package
pcu analyze react 19.0.0
```

**[Complete AI Analysis Documentation](https://pcu-cli.dev/en/ai-analysis)**

![PCU Showcase](https://github.com/user-attachments/assets/f05a970e-c58c-44f1-b3f1-351ae30b4a35)

**[Complete Command Reference & Examples](https://pcu-cli.dev/en/command-reference)**

## Links

- [Complete Documentation](https://pcu-cli.dev/en)
- [Report Issues](https://github.com/houko/pnpm-catalog-updates/issues)
- [GitHub Repository](https://github.com/houko/pnpm-catalog-updates)

## License

MIT © [Evan Hu](https://github.com/houko)
