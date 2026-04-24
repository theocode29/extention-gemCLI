#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("@modelcontextprotocol/sdk/server");
const stdio_1 = require("@modelcontextprotocol/sdk/server/stdio");
const zod_1 = require("zod");
const path_1 = __importDefault(require("path"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const ShadowGitManager_1 = require("./subsystems/ShadowGitManager");
const project_1 = require("./tools/project");
const file_editor_1 = require("./tools/file-editor");
const ConfigLoader_1 = require("./subsystems/ConfigLoader");
// Re-export types for tool handlers
__exportStar(require("./types"), exports);
const SERVER_NAME = 'gemini-datapack-agent';
const SERVER_VERSION = '0.1.0';
async function main() {
    // Determine project root: use DATAPACK_ROOT env var or current working directory
    const projectRoot = process.env.DATAPACK_ROOT || process.cwd();
    const absoluteProjectRoot = path_1.default.resolve(projectRoot);
    console.error(`Starting ${SERVER_NAME} v${SERVER_VERSION}`);
    console.error(`Project root: ${absoluteProjectRoot}`);
    // Ensure project root exists
    if (!fs_extra_1.default.existsSync(absoluteProjectRoot)) {
        console.error(`Project root does not exist: ${absoluteProjectRoot}`);
        process.exit(1);
    }
    // Initialize subsystems
    const gitManager = new ShadowGitManager_1.ShadowGitManager(absoluteProjectRoot);
    const config = (0, ConfigLoader_1.loadConfig)(absoluteProjectRoot);
    // Initialize git (async but we'll await)
    try {
        const gitInit = await gitManager.initialize();
        console.error(`Git initialized: ${gitInit.initialized}`);
    }
    catch (error) {
        console.error(`Warning: Failed to initialize git: ${error}`);
    }
    // Track edit failures for bail-out logic
    const editFailureCount = { count: 0, reset: () => { editFailureCount.count = 0; }, increment: () => { editFailureCount.count++; } };
    // Instantiate tool handlers
    const projectTools = new project_1.ProjectTools(absoluteProjectRoot, gitManager);
    const fileEditor = new file_editor_1.FileEditor({ gitManager, projectRoot: absoluteProjectRoot, editFailureCount });
    // Create MCP server
    const server = new server_1.McpServer({
        name: SERVER_NAME,
        version: SERVER_VERSION,
    }, {
        capabilities: {
            tools: {},
        },
    });
    // ===== TOOL REGISTRATION =====
    // Tool: scaffold_project
    server.registerTool('scaffold_project', {
        version: zod_1.z.string().describe('Minecraft version, e.g., "1.20.2"'),
        datapack_name: zod_1.z.string().describe('Name of the datapack'),
        namespace: zod_1.z.string().optional().describe('Namespace (default: lowercase name with underscores)'),
        description: zod_1.z.string().optional().describe('Optional description for the datapack'),
    }, async ({ version, datapack_name, namespace, description }) => {
        const result = await projectTools.scaffoldProject({ version, datapack_name, namespace, description });
        if (!result.success) {
            throw new Error(result.error || 'Scaffold failed');
        }
        return {
            content: [{ type: 'json', json: result }],
        };
    });
    // Tool: read_task_state
    server.registerTool('read_task_state', {}, async () => {
        const state = await projectTools.readTaskState();
        return {
            content: [{ type: 'json', json: state }],
        };
    });
    // Tool: update_task_state
    server.registerTool('update_task_state', {
        task_id: zod_1.z.string().describe('Task identifier'),
        new_status: zod_1.z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED']).describe('New status'),
        notes: zod_1.z.string().optional().describe('Optional notes about the update'),
    }, async ({ task_id, new_status, notes }) => {
        const result = await projectTools.updateTaskState({ task_id, new_status, notes });
        if (!result.success) {
            throw new Error(result.error || 'Update failed');
        }
        return {
            content: [{ type: 'json', json: { success: true, task: result.task } }],
        };
    });
    // Tool: read_file
    server.registerTool('read_file', {
        path: zod_1.z.string().describe('Relative path to the file within the datapack'),
    }, async ({ path: filePath }) => {
        const result = await fileEditor.readFile({ path: filePath });
        return {
            content: [{ type: 'json', json: result }],
        };
    });
    // Tool: create_file
    server.registerTool('create_file', {
        path: zod_1.z.string().describe('Relative path for the new file'),
        content: zod_1.z.string().describe('File content'),
    }, async ({ path: filePath, content }) => {
        const result = await fileEditor.createFile({ path: filePath, content });
        if (!result.success) {
            throw new Error(result.error || 'Create failed');
        }
        return {
            content: [{ type: 'text', text: `File created: ${filePath}` }],
        };
    });
    // Tool: edit_file_replace
    server.registerTool('edit_file_replace', {
        path: zod_1.z.string().describe('Relative path to the file'),
        old_snippet: zod_1.z.string().describe('Exact text to replace (including whitespace)'),
        new_snippet: zod_1.z.string().describe('New text to insert'),
        expected_line: zod_1.z.number().optional().describe('Expected line number (for validation)'),
    }, async ({ path: filePath, old_snippet, new_snippet, expected_line }) => {
        const result = await fileEditor.editFileReplace({ path: filePath, old_snippet, new_snippet, expected_line: expected_line });
        if (!result.success) {
            // If bailout triggered, we need special handling
            if (editFailureCount.count >= config.hitl.bailoutThreshold) {
                // Auto-trigger HITL (integrated later in Phase 2)
                throw new Error(`BAILOUT: Edit failed ${editFailureCount.count} times. Human review required.`);
            }
            throw new Error(result.error?.message || 'Edit failed');
        }
        return {
            content: [
                { type: 'text', text: `Replaced at line ${result.replaced_at_line}` },
                { type: 'json', json: { success: true, line: result.replaced_at_line } },
            ],
        };
    });
    // Tool: edit_json_value
    server.registerTool('edit_json_value', {
        path: zod_1.z.string().describe('Relative path to the JSON file'),
        json_path: zod_1.z.string().describe('JSONPath expression, e.g., "$.values[0].value"'),
        new_value: zod_1.z.any().describe('New value (any JSON-serializable)'),
    }, async ({ path: filePath, json_path, new_value }) => {
        const result = await fileEditor.editJsonValue({ path: filePath, json_path, new_value });
        if (!result.success) {
            throw new Error(result.error?.message || 'JSON edit failed');
        }
        return {
            content: [
                { type: 'text', text: `JSON updated: ${json_path}` },
                { type: 'json', json: { previous: result.previous_value, current: result.new_value } },
            ],
        };
    });
    // Tool: rollback_last_action
    server.registerTool('rollback_last_action', {}, async () => {
        const result = await fileEditor.rollbackLastAction();
        if (!result.success) {
            throw new Error(result.error || 'Rollback failed');
        }
        return {
            content: [{ type: 'json', json: result }],
        };
    });
    // Connect stdio transport
    const transport = new stdio_1.StdioServerTransport();
    await server.connect(transport);
    console.error('Server connected and listening on stdio');
}
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map