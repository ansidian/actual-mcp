# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

An MCP (Model Context Protocol) server that exposes [Actual Budget](https://actualbudget.com/) financial data to LLMs. It connects to an Actual Budget instance (local or remote) and provides tools for reading/writing accounts, transactions, categories, payees, rules, schedules, notes, and budgets.

## Commands

```bash
npm run build          # Compile TypeScript (tsconfig.build.json → build/)
npm run watch          # Compile in watch mode for development
npm start              # Run from source via tsx
npm test               # Run all Vitest tests once
npm run test:unit:watch # Vitest in watch mode
npm run test:coverage  # Coverage report
npm run quality        # Lint + format check + type-check (run before committing)
npm run lint:fix       # Auto-fix ESLint issues
npm run format         # Auto-format with Prettier
npm run inspector      # Launch MCP Inspector for debugging
```

Run a single test file: `npx vitest run src/tools/create-transaction/index.test.ts`

## Architecture

### Transport Layer

[src/index.ts](src/index.ts) — Server entry point. Supports three transport modes:
- **stdio** (default) — for Claude Desktop and CLI clients
- **SSE** (`--sse`) — legacy Server-Sent Events over Express
- **Streamable HTTP** — modern MCP transport, auto-detected on `/` and `/mcp`

CLI flags: `--sse`, `--enable-write`, `--enable-bearer`, `--port <N>`, `--test-resources`

### API Lifecycle

[src/actual-api.ts](src/actual-api.ts) — Wraps `@actual-app/api`. Every tool call follows init → execute → shutdown. The `initActualApi()` / `shutdownActualApi()` pair is called per-request in [src/tools/index.ts](src/tools/index.ts). Tools that set `requiresApi: false` in their schema skip this lifecycle (e.g., `query-knowledge`).

### Tool Registration

[src/tools/index.ts](src/tools/index.ts) — Central tool registry. Tools are split into `readTools` (always available) and `writeTools` (enabled by `--enable-write` flag). Each tool module exports `schema` and `handler`.

### Tool Module Pattern

Every tool under `src/tools/<tool-name>/` follows this decomposition:
- `index.ts` — Exports `schema` (with Zod→JSON Schema via `zod-to-json-schema`) and `handler` function
- `input-parser.ts` — Validates and transforms raw args
- `data-fetcher.ts` — Retrieves data from Actual API
- `report-generator.ts` — Formats output as markdown
- `types.ts` — Tool-specific type definitions

Simple tools (CRUD operations like `create-payee`, `delete-category`) use a single `index.ts` file. Complex tools (`get-transactions`, `spending-by-category`, `monthly-summary`, `balance-history`) use the full decomposition.

### Core Utilities

[src/core/](src/core/) — Shared modules re-exported from `src/core/index.ts`:
- `data/` — Fetch functions wrapping `actual-api.ts` (accounts, categories, payees, transactions, etc.)
- `aggregation/` — `groupBy`, `sumBy`, `sortBy`, `transactionGrouper`
- `mapping/` — `categoryMapper`, `transactionMapper`, `categoryClassifier`
- `input/` — `argumentParser`, `validators`
- `knowledge/` — RAG pipeline: `chunker`, `transaction-chunker`, `embedder`, `knowledge-store` (uses `@orama/orama` for vector search)

### Knowledge / RAG System

[src/core/knowledge/](src/core/knowledge/) — In-memory vector search using Orama. Chunks budget data (categories, transactions) into searchable documents. The `query-knowledge` tool queries this store without needing the Actual API connection.

### Resources and Guides

[src/resources.ts](src/resources.ts) — MCP resources: dynamic account listings + static guide content (month-ahead strategy, spending decisions, template syntax reference, user financial context). Guide content is inline as `GUIDE_CONTENT` map keyed by `actual://guides/<name>` URIs.

[src/tools/guides/get-guide/](src/tools/guides/get-guide/) — Tool wrapper that serves guide content by name.

### Response Helpers

[src/utils/response.ts](src/utils/response.ts) — `success()`, `error()`, `errorFromCatch()`, `successWithJson()` — standardized MCP `CallToolResult` builders. All tool handlers should return these.

## Code Conventions

- **ESM modules** — `"type": "module"` in package.json. All imports use `.js` extensions (TypeScript resolves them).
- **Zod schemas** define tool input validation. Schemas in `src/types.ts` are converted to JSON Schema via `zod-to-json-schema` for MCP registration.
- **Amounts are in cents** internally (Actual API convention). Convert to dollars for display (`amount / 100`).
- **Tests are co-located** — `foo.ts` → `foo.test.ts` in the same directory.
- **Mock `@actual-app/api`** in tests with `vi.mock()`. See existing tests for patterns.
- **Max 500 lines per file.** Split into sub-modules when approaching this limit.
- **Use Context7** (`@modelcontextprotocol/sdk`, `@actual-app/api`, `@orama/orama`) for up-to-date API docs when working with these packages.

## Environment Variables

- `ACTUAL_SERVER_URL` — Remote Actual server URL
- `ACTUAL_PASSWORD` — Server authentication password
- `ACTUAL_BUDGET_SYNC_ID` — Specific budget to load (defaults to first)
- `ACTUAL_DATA_DIR` — Local data directory (defaults to `~/.actual`)
- `ACTUAL_BUDGET_ENCRYPTION_PASSWORD` — Separate encryption password if different from server password
- `BEARER_TOKEN` — Required when `--enable-bearer` is used for SSE/HTTP transport
- `OPENAI_API_KEY` — API key for OpenAI embeddings (enables vector search in knowledge store; falls back to BM25-only if missing)
- `EMBEDDING_API_URL` — Override embedding API URL (defaults to `https://api.openai.com/v1`)
- `EMBEDDING_MODEL` — Override embedding model (defaults to `text-embedding-3-small`)
