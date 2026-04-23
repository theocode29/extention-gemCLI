# Init Command Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the `/dp-init` command by exposing and implementing the `fs_workspace_init` tool in the MCP server.

**Architecture:** Update the MCP server to include `fs_workspace_init` in its tool list and route calls to `BONEEngine.initTemplate()` followed by project state synchronization.

**Tech Stack:** TypeScript, MCP SDK.

---

### Task 1: Expose Tool and Implement Handler

**Files:**
- Modify: `mcp-server/src/index.ts`

- [ ] **Step 1: Add \`fs_workspace_init\` to the tool list**

Update the `ListToolsRequestSchema` handler to include the new tool.

```typescript
// mcp-server/src/index.ts

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // ... existing tools
      { name: "fs_workspace_init", description: "Initialise un nouveau projet de datapack avec le template BONE:MSD.", inputSchema: { type: "object", properties: { version: { type: "string" } }, required: ["version"] } },
      { name: "reset_circuit_breaker", description: "Reset global du disjoncteur.", inputSchema: { type: "object" } }
    ],
  };
});
```

- [ ] **Step 2: Implement the handler logic**

Add the `fs_workspace_init` case to the `CallToolRequestSchema` handler.

```typescript
// mcp-server/src/index.ts

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      // ... existing cases
      case "fs_workspace_init": {
        const initRes = await boneEngine.initTemplate();
        await stateManager.syncAll();
        return { content: [{ type: "text", text: initRes }] };
      }
      // ... rest of switch
```

- [ ] **Step 3: Commit changes**

```bash
git add mcp-server/src/index.ts
git commit -m "feat: expose and implement fs_workspace_init tool"
```

---

### Task 2: Build and Verification

- [ ] **Step 1: Rebuild the MCP server**

Run: `cd mcp-server && npm run build`
Expected: Success.

- [ ] **Step 2: Verify CLI loading**

Wait for the CLI to reload or restart the session.
Expected: No more `[FileCommandLoader]` error for `init.toml`.

- [ ] **Step 3: Test the command**

Run: `/dp-init version=1.21`
Expected: Success message and files cloned into the workspace.
