# Batmanuel

Batmanuel is a CLI for analyzing code quality and safely remediating npm dependency vulnerabilities. It analyzes a local project directory and does not expose an HTTP API, server, authentication flow, or Swagger interface.

## Install

```bash
npm install --save-dev batmanuel
```

For development in this repository:

```bash
npm install
npm run build
```

## Commands

```bash
batmanuel analyze [path] [--verbose]
batmanuel dependencies-fix [path] [--verbose]
batmanuel --help
```

`path` defaults to the current directory. `--verbose` (or `-v`) displays internal execution logs.

### Analyze a project

```bash
batmanuel analyze .
```

The command prints an `AnalysisReport` JSON document containing the score, quality-gate result, metrics, and issues found by the duplication, security, and dependency scanners.

### Remediate npm vulnerabilities

```bash
batmanuel dependencies-fix . --verbose
```

This command supports npm projects with a `package-lock.json`. It uses OSV and `npm audit --json` metadata, applies compatible direct-dependency or parent-dependency updates, and uses npm `overrides` only for compatible transitive fixes. Major-version changes require manual review.

Before writing changes, Batmanuel backs up `package.json` and `package-lock.json`. It restores both files if `npm install` or vulnerability revalidation fails.

## CI usage

Run Batmanuel directly in the checked-out repository:

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with:
    node-version: 22
- run: npm ci
- run: npx batmanuel analyze . > batmanuel-report.json
- run: jq -e '.passed == true' batmanuel-report.json
```

## Development

```bash
npm run build
npm test -- --runInBand --watchman=false
```
