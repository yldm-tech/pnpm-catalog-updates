# pnpm-catalog-updates

A powerful CLI tool to check and update pnpm workspace catalog dependencies,
inspired by
[npm-check-updates](https://github.com/raineorshine/npm-check-updates).

**Full Documentation**: [https://pcu-cli.dev](https://pcu-cli.dev/en)

[![npm version](https://img.shields.io/npm/v/pcu.svg)](https://www.npmjs.com/package/pcu)
[![npm downloads](https://img.shields.io/npm/dm/pcu.svg)](https://www.npmjs.com/package/pcu)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen.svg)](https://nodejs.org/)
[![CI](https://img.shields.io/github/actions/workflow/status/houko/pnpm-catalog-updates/ci.yml?label=CI&logo=github)](https://github.com/houko/pnpm-catalog-updates/actions)
[![Coverage](https://img.shields.io/coveralls/github/houko/pnpm-catalog-updates/main)](https://coveralls.io/github/houko/pnpm-catalog-updates)

## Features

- **One-Command Setup**: Initialize complete PNPM workspace with `pcu init`
- **Smart Detection**: Automatically discovers pnpm workspaces and catalog
  configurations
- **Catalog Focused**: Specialized for pnpm catalog dependency management
- **Interactive Mode**: Choose which dependencies to update with an intuitive
  interface
- **AI-Powered Analysis**: Intelligent update recommendations using Claude,
  Gemini, or Codex CLI tools with automatic fallback to rule-based analysis
- **Impact Analysis**: Understand which packages will be affected by catalog
  changes
- **Safe Updates**: Dry-run mode and backup options for safe dependency updates
- **High Performance**: Parallel API queries and intelligent caching
- **Security Aware**: Built-in security vulnerability scanning
- **Beautiful UI**: Enhanced progress bars, color themes, and interactive
  prompts
- **Progress Bar Styles**: Choose from gradient, fancy, minimal, rainbow, neon,
  or blocks styles
- **Customizable Themes**: Multiple color themes (default, modern, minimal,
  neon)
- **Real-time Progress**: Live progress tracking with speed indicators and time
  estimates
- **Smart Version Check**: Automatic update notifications with --version command
- **Private Registry Support**: Automatically reads `.npmrc` and `.pnpmrc`
  configurations
- **Multi-Registry**: Supports different registries for different package scopes
- **Configurable**: Flexible configuration options and update strategies

**[See all features and details](https://pcu-cli.dev/en)**

## Quick Start

### Installation

```bash
# Global installation (recommended)
npm install -g pcu

# Or use with npx
npx pnpm-catalog-updates
```

### Basic Usage

```bash
# Initialize a new PNPM workspace with PCU configuration
pcu init

# Check for updates in existing workspace
pcu -c

# Interactive update mode
pcu -i
```

![Image](https://github.com/user-attachments/assets/f05a970e-c58c-44f1-b3f1-351ae30b4a35)

**[Complete Installation & Usage Guide](https://pcu-cli.dev/en/quickstart)**

## Documentation

**[Complete Command Reference](https://pcu-cli.dev/en/command-reference)**  
**[Configuration Guide](https://pcu-cli.dev/en/configuration)**  
**[Examples & Use Cases](https://pcu-cli.dev/en/examples)**

## Project Structure

This project is organized as a pnpm monorepo with clean architecture:

```text
├── apps/
│   └── cli/                    # CLI application
└── packages/
    ├── core/                   # Core business logic
    └── utils/                  # Shared utilities
```

**[Detailed Architecture Guide](https://pcu-cli.dev/en/development)**

## Development

### Prerequisites

- Node.js >= 22.0.0
- pnpm >= 10.0.0

### Setup

```bash
# Clone the repository
git clone https://github.com/houko/pnpm-catalog-updates.git
cd pnpm-catalog-updates

# Install dependencies
pnpm install

# Build and run
pnpm build
pnpm dev --help
```

**[Complete Development Guide](https://pcu-cli.dev/en/development)**

## Configuration Example

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'

catalog:
  react: ^18.2.0
  typescript: ^5.0.0

catalogs:
  react17:
    react: ^17.0.2
```

```json
// .pcurc.json
{
  "defaults": {
    "target": "latest"
  },
  "packageRules": [
    {
      "patterns": ["react", "react-dom"],
      "target": "minor"
    }
  ]
}
```

**[Configuration Examples & Templates](https://pcu-cli.dev/en/examples)**

## AI-Powered Analysis

PCU supports AI-powered dependency analysis using popular AI CLI tools:

| Provider | Priority | Detection    |
| -------- | -------- | ------------ |
| Claude   | 100      | `claude` CLI |
| Gemini   | 80       | `gemini` CLI |
| Codex    | 60       | `codex` CLI  |

### How it works

1. **Auto-detection**: PCU automatically detects installed AI CLI tools
2. **Priority-based selection**: Uses the highest priority available provider
3. **Intelligent caching**: Results are cached to avoid redundant API calls
4. **Graceful fallback**: Falls back to rule-based analysis when no AI tools are
   available

### Analysis Types

- **Impact Analysis**: Assess the impact of updates on your codebase
- **Security Analysis**: Identify security implications of dependency changes
- **Compatibility Analysis**: Check for breaking changes and compatibility
  issues
- **Recommendations**: Get smart suggestions for update strategies

### Configuration

```json
// .pcurc.json
{
  "ai": {
    "enabled": true,
    "preferredProvider": "auto",
    "cache": {
      "enabled": true,
      "ttl": 3600
    },
    "fallback": {
      "enabled": true,
      "useRuleEngine": true
    }
  }
}
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md)
for details.

**[Development Setup & Guidelines](https://pcu-cli.dev/en/development)**

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file
for details.

## Acknowledgments

- Inspired by
  [npm-check-updates](https://github.com/raineorshine/npm-check-updates)
- Built with love for the pnpm community
- Thanks to all contributors and users

## Support

- [Full Documentation](https://pcu-cli.dev/en)
- [Issue Tracker](https://github.com/houko/pnpm-catalog-updates/issues)
- [Discussions](https://github.com/houko/pnpm-catalog-updates/discussions)

---

Made with ❤️ for the pnpm community
