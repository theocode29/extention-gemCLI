# Production Readiness Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the prototype into a production-ready extension by fixing uninitialized engines, missing handlers, and non-functional stubs.

**Architecture:** Initialize DocSearchEngine on startup, fix tool routing in index.ts, integrate CircuitBreaker logic, and provide better diagnostics for missing dependencies.

**Tech Stack:** TypeScript, MCP SDK, Node.js, fs-extra.

---

### Task 1: MCP Server Core Robustness

**Files:**
- Modify: `mcp-server/src/index.ts`

- [ ] **Step 1: Initialize DocSearchEngine at startup**
Add `.init()` call to ensure `search_docs` works.

- [ ] **Step 2: Fix \`bone_ingest_template\` routing**
Ensure it calls both BONE and Bookshelf ingestion and re-inits the search index.

- [ ] **Step 3: Implement \`inject_bone_mcdoc\` handler**
Add the missing case in the CallToolRequest switch.

- [ ] **Step 4: Commit core fixes**
```bash
git add mcp-server/src/index.ts
git commit -m "fix: initialize RAG engine and add missing tool handlers"
```

---

### Task 2: Circuit Breaker & Testing Diagnostics

**Files:**
- Modify: `mcp-server/src/index.ts`

- [ ] **Step 1: Integrate CircuitBreaker into linting handler**
Increment and check attempts for `bone_semantic_lint`.

- [ ] **Step 2: Improve HeadlessMC diagnostics**
Provide a clear actionable error message if the JAR is missing.

- [ ] **Step 3: Commit robustness improvements**
```bash
git add mcp-server/src/index.ts
git commit -m "feat: add circuit breaker logic and better test diagnostics"
```

---

### Task 3: Engine & Schema Improvements

**Files:**
- Modify: `mcp-server/src/BookshelfEngine.ts`

- [ ] **Step 1: Upgrade Bookshelf MCDoc stub**
Replace `any` with a structural schema to enable better static validation.

- [ ] **Step 2: Commit engine improvements**
```bash
git add mcp-server/src/BookshelfEngine.ts
git commit -m "refactor: upgrade bookshelf mcdoc schema from any to structural"
```

---

### Task 4: Final Verification

- [ ] **Step 1: Build the project**
`npm run build` in mcp-server directory.

- [ ] **Step 2: Run verification script**
Ensure everything still compiles and basic logic holds.
