# Release Guide

## Release Process

This project uses [Changesets](https://github.com/changesets/changesets) for version management and automated releases.

### 1. Create a Changeset

When you make changes that should be released, create a changeset:

```bash
pnpm changeset
```

This will prompt you to:
- Select the package to release (`pcu`)
- Choose the version bump type (`patch`, `minor`, `major`)
- Write a summary of the changes

A markdown file will be created in `.changeset/` directory.

### 2. Commit the Changeset

```bash
git add .changeset/*.md
git commit -m "chore: add changeset for <feature>"
git push
```

### 3. Automated Release via CI

When changes are merged to `main`:

1. CI detects pending changesets
2. Creates a "Version Packages" PR that:
   - Bumps version in `package.json`
   - Updates `CHANGELOG.md`
   - Removes consumed changeset files
3. Merging this PR triggers the publish workflow
4. Package is published to npm as both `pcu` and `pnpm-catalog-updates`

### Version Types

| Type | When to Use | Example |
|------|-------------|---------|
| `patch` | Bug fixes, documentation | 1.0.0 -> 1.0.1 |
| `minor` | New features (backward compatible) | 1.0.0 -> 1.1.0 |
| `major` | Breaking changes | 1.0.0 -> 2.0.0 |

### Manual Release (Emergency Only)

For emergency releases when CI is unavailable:

```bash
npm login
pnpm release
```

Note: This bypasses changesets and directly publishes the current version.

## Changeset Example

```markdown
---
'pcu': minor
---

feat: add AI-powered dependency analysis

- Add `pcu ai` command
- Add `--ai` flag for update command
- Support multiple AI providers
```
