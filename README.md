<p align="center">
  <img src="./assets/logo.png" alt="Batmanuel logo" width="280" />
</p>

<p align="center">
  <img alt="Build Status" src="https://github.com/bernardo-amaral/batmanuel/actions/workflows/code-quality.yml/badge.svg?branch=main" />
  <img alt="Latest Release" src="https://img.shields.io/github/v/release/bernardo-amaral/batmanuel" />
</p>

# Batmanuel

**Batmanuel** is a code quality platform built with NestJS. It analyzes repositories to measure code quality, detect duplicated code, and evaluate results through a configurable rules engine that produces a consolidated score and quality gate decision.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [API Routes](#api-routes)
  - [POST /auth/token](#post-authtoken)
  - [POST /analyze](#post-analyze)
  - [POST /analyze/upload](#post-analyzeupload)
  - [GET /analyze/:projectId/summary](#get-analyzeprojectidsummary)
- [Rules Engine](#rules-engine)
- [Authentication](#authentication)
- [Swagger / API Documentation](#swagger--api-documentation)
- [GitHub Actions Integration](#github-actions-integration)
- [Roadmap](#roadmap)
- [Contributing](#contributing)

---

## Architecture Overview

Batmanuel currently acts as an orchestrator for internal analysis engines plus a scoring layer. It scans source code, normalizes findings into a common `AnalysisReport`, evaluates the result through `RulesService`, and returns a quality gate response for a given project, branch, and commit.

```text
GitHub Actions / Client
          |
          v
   Batmanuel API (NestJS)
          |
          +--> Auth module (project token validation)
          |
          +--> Analyze module
          |      |
          |      +--> DuplicationService
          |      +--> RulesService
          |
          v
   AnalysisReport + score + threshold + passed
```

At this stage, the API supports direct analysis requests and uploaded repository archives, which allows CI pipelines to send a zipped version of the repository instead of relying on a server-side filesystem path.

---

## Project Structure

```text
src/
├── app.module.ts
├── main.ts
├── auth/
│   ├── auth.controller.ts
│   ├── auth.module.ts
│   └── token.guard.ts
├── analyze/
│   ├── analyze.controller.ts
│   ├── analyze.module.ts
│   ├── analyze.service.ts
│   ├── dto/
│   │   ├── analyze-request.dto.ts
│   │   └── analyze-upload-request.dto.ts
│   └── interfaces/
│       ├── analysis-metrics.interface.ts
│       ├── analysis-report.interface.ts
│       └── issue.interface.ts
├── engines/
│   ├── duplication.service.ts
│   └── interfaces/
│       └── duplication-result.interface.ts
└── rules/
    ├── config/
    │   └── default-rules.config.ts
    ├── interfaces/
    │   └── rules-config.interface.ts
    ├── rules.constants.ts
    ├── rules.module.ts
    └── rules.service.ts
```

### Module responsibilities

- `auth/`: generates and validates Bearer tokens for protected endpoints.
- `analyze/`: receives analysis requests, orchestrates engines, and returns normalized reports.
- `engines/`: contains concrete analyzers such as `DuplicationService`.
- `rules/`: contains the scoring and threshold logic, exposed through `RulesService` and configured through the exported `RULES_CONFIG` provider token.

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
npm install
```

### Running locally

```bash
npm run start:dev
```

The API will be available at `http://localhost:3000`.

### Testing `POST /analyze`

```bash
curl -X POST http://localhost:3000/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -d '{
    "projectId":"my-project-backend",
    "branch":"main",
    "commit":"abc123",
    "sourcePath":"./src"
  }'
```

### Testing `POST /analyze/upload`

```bash
curl -X POST http://localhost:3000/analyze/upload \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -F "projectId=my-project-backend" \
  -F "branch=main" \
  -F "commit=abc123" \
  -F "file=@source-code.zip"
```

---

## API Routes

### POST /auth/token

Generates an access token for a given project. This token must be used to authenticate all subsequent requests to protected routes.

**Request body:**

```json
{
  "projectId": "my-project-backend"
}
```

**Response:**

```json
{
  "projectId": "my-project-backend",
  "token": "<GENERATED_TOKEN>",
  "expiresIn": "30d"
}
```

---

### POST /analyze

Receives project, branch, commit, and source path information, runs the configured analysis engines, and returns a consolidated report. Requires authentication.

**Request body:**

```json
{
  "projectId": "my-project-backend",
  "branch": "main",
  "commit": "abc123",
  "sourcePath": "./src"
}
```

**Response:**

```json
{
  "projectId": "my-project-backend",
  "branch": "main",
  "commit": "abc123",
  "timestamp": "2026-07-15T15:00:00.000Z",
  "score": 82,
  "passed": true,
  "threshold": 70,
  "metrics": {
    "securityCritical": 0,
    "securityHigh": 0,
    "securityMedium": 1,
    "qualitySmells": 0,
    "duplications": 2,
    "outdatedDeps": 0
  },
  "issues": [
    {
      "engine": "duplication-service",
      "type": "quality",
      "severity": "medium",
      "ruleId": "duplicate-code",
      "message": "Duplicated block found between src/a.ts:10 and src/b.ts:18",
      "file": "src/b.ts",
      "line": 18
    }
  ]
}
```

| Field                      | Type    | Description                                       |
| -------------------------- | ------- | ------------------------------------------------- |
| `score`                    | number  | Overall quality score from 0 to 100.              |
| `passed`                   | boolean | Whether the score meets the configured threshold. |
| `threshold`                | number  | Minimum required score to pass the quality gate.  |
| `metrics.securityCritical` | number  | Number of critical security issues.               |
| `metrics.securityHigh`     | number  | Number of high severity security issues.          |
| `metrics.securityMedium`   | number  | Number of medium severity security issues.        |
| `metrics.qualitySmells`    | number  | Number of quality smell issues.                   |
| `metrics.duplications`     | number  | Number of duplicated code blocks found.           |
| `metrics.outdatedDeps`     | number  | Number of outdated or vulnerable dependencies.    |
| `issues[].type`            | string  | `security`, `quality`, or `dependency`.           |
| `issues[].severity`        | string  | `critical`, `high`, `medium`, `low`, or `info`.   |

---

### POST /analyze/upload

Uploads a zipped repository with `multipart/form-data`, extracts it in a temporary directory, resolves the source directory, and runs the same analysis pipeline used by `POST /analyze`. This endpoint is designed for CI environments where the API cannot access the repository path directly on the runner.

**Form fields:**

- `projectId`: unique project identifier
- `branch`: analyzed branch
- `commit`: analyzed commit SHA
- `file`: zipped repository archive

**Example request:**

```bash
curl -X POST http://localhost:3000/analyze/upload \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -F "projectId=my-project-backend" \
  -F "branch=main" \
  -F "commit=abc123" \
  -F "file=@source-code.zip"
```

**Example response:**

```json
{
  "projectId": "my-project-backend",
  "branch": "main",
  "commit": "abc123",
  "timestamp": "2026-07-15T15:00:00.000Z",
  "score": 100,
  "passed": true,
  "threshold": 70,
  "metrics": {
    "securityCritical": 0,
    "securityHigh": 0,
    "securityMedium": 0,
    "qualitySmells": 0,
    "duplications": 0,
    "outdatedDeps": 0
  },
  "issues": []
}
```

---

### GET /analyze/:projectId/summary

Returns a summary for a given project. Requires authentication.

**Response:**

```json
{
  "projectId": "my-project-backend",
  "lastScore": 82,
  "trend": [76, 78, 80, 82],
  "lastAnalysisAt": "2026-07-15T15:00:00.000Z"
}
```

---

## Rules Engine

Batmanuel now includes a dedicated `rules/` module responsible for turning raw findings into a final score and quality gate decision.

### Components

- `rules.constants.ts`: declares the injection token, currently `RULES_CONFIG`.
- `interfaces/rules-config.interface.ts`: defines the shape of the rules configuration.
- `config/default-rules.config.ts`: holds the default scoring and threshold values.
- `rules.service.ts`: evaluates findings and returns score, threshold, pass/fail, and breakdown data.
- `rules.module.ts`: registers and exports both `RulesService` and `RULES_CONFIG`.

### Flow

1. An analysis engine generates findings, such as duplicated blocks.
2. `AnalyzeService` converts those findings into normalized `Issue[]`.
3. `RulesService.evaluate(...)` applies penalties and thresholds from the injected config.
4. The final API response includes:
   - `score`
   - `passed`
   - `threshold`
   - metrics and issues

### Example conceptual config

```ts
export const DEFAULT_RULES_CONFIG = {
  threshold: 70,
  penalties: {
    critical: 40,
    high: 20,
    medium: 5,
    low: 1,
  },
};
```

This structure makes it straightforward to tune the quality gate without changing analysis controllers or engines.

---

## Authentication

All routes except `POST /auth/token` require a Bearer token in the `Authorization` header:

```text
Authorization: Bearer <YOUR_TOKEN>
```

The `TokenGuard` in `src/auth/token.guard.ts` validates the token before allowing access to protected endpoints.

---

## Swagger / API Documentation

Interactive API documentation is powered by `@nestjs/swagger`.

### Accessing the docs

```text
http://localhost:3000/docs
```

If your application uses a global prefix such as `api`, the docs path will follow that prefix accordingly.

### Authenticating in Swagger UI

1. Open `/docs`.
2. Click **Authorize**.
3. Paste your Bearer token.
4. Test protected routes directly from the UI.

### Upload endpoint in Swagger

The upload route is documented as `multipart/form-data` and exposes the binary `file` field plus additional form fields.

---

## GitHub Actions Integration

A workflow is provided at `.github/workflows/code-quality.yml`. It now packages the checked-out repository as a `.zip`, uploads it to `POST /analyze/upload`, parses the JSON response with `jq`, and fails the pipeline if the quality gate is not met.

### Required repository secrets

| Secret              | Description                                |
| ------------------- | ------------------------------------------ |
| `QUALITY_API_URL`   | Public URL of the Batmanuel API            |
| `QUALITY_API_TOKEN` | Bearer token used to authenticate requests |

### Example workflow

```yaml
name: Code Quality Check

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  batmanuel:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Create source archive
        run: |
          zip -r source-code.zip . \
            -x ".git/*" \
            -x "node_modules/*" \
            -x "dist/*" \
            -x "coverage/*"

      - name: Send source archive to Batmanuel
        run: |
          HTTP_STATUS=$(curl -sS -X POST "$QUALITY_API_URL/analyze/upload" \
            --connect-timeout 15 \
            --max-time 300 \
            -H "Authorization: Bearer $QUALITY_API_TOKEN" \
            -F "projectId=batmanuel" \
            -F "branch=$GITHUB_REF_NAME" \
            -F "commit=$GITHUB_SHA" \
            -F "file=@source-code.zip" \
            -o response.json \
            -w "%{http_code}")

          echo "HTTP status: $HTTP_STATUS"
          echo "Response body:"
          cat response.json

          if [ "$HTTP_STATUS" != "200" ] && [ "$HTTP_STATUS" != "201" ]; then
            echo "Batmanuel API returned unexpected HTTP status: $HTTP_STATUS"
            exit 1
          fi
        env:
          QUALITY_API_URL: ${{ secrets.QUALITY_API_URL }}
          QUALITY_API_TOKEN: ${{ secrets.QUALITY_API_TOKEN }}

      - name: Validate response schema
        run: |
          if ! jq -e '.passed != null and .score != null and .threshold != null' response.json > /dev/null; then
            echo "Response JSON does not contain passed/score/threshold."
            echo "Actual response:"
            cat response.json
            exit 1
          fi

      - name: Check quality gate
        run: |
          PASSED=$(jq -r '.passed' response.json)
          SCORE=$(jq -r '.score' response.json)
          THRESHOLD=$(jq -r '.threshold' response.json)

          echo "Score: $SCORE (threshold: $THRESHOLD)"

          if [ "$PASSED" != "true" ]; then
            echo "Quality gate failed: score $SCORE is below threshold $THRESHOLD."
            exit 1
          fi

          echo "Quality gate passed."
```

### Integration flow

1. Check out the repository.
2. Compress the source code into `source-code.zip`.
3. Upload the archive to `POST /analyze/upload`.
4. Read `passed`, `score`, and `threshold` from `response.json`.
5. Fail the workflow if the repository does not satisfy the configured quality gate.

---

## Roadmap

- Persistence of historical reports in PostgreSQL.
- Expanded analysis engines for security and dependency scanning.
- Angular dashboard for score trends and issue exploration.
- Standalone CLI for local project analysis and API submission.
- Additional CI integrations beyond GitHub Actions.

---

## Contributing

This project is under active development. Contributions, suggestions, and issue reports are welcome via pull requests and GitHub issues.
