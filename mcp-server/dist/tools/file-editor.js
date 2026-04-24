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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileEditor = void 0;
const fs_extra_1 = __importDefault(require("fs-extra"));
const file_ops_1 = require("../utils/file-ops");
/**
 * File Editor Tools
 * Handles reading, creating, editing files with surgical precision
 */
class FileEditor {
    gitManager;
    projectRoot;
    editFailureCount;
    constructor(options) {
        this.gitManager = options.gitManager;
        this.projectRoot = options.projectRoot;
        this.editFailureCount = options.editFailureCount;
    }
    /**
     * Read a file and return numbered lines
     */
    async readFile(params) {
        const fullPath = (0, file_ops_1.resolveProjectPath)(this.projectRoot, params.path);
        if (!fs_extra_1.default.existsSync(fullPath)) {
            throw new Error(`File not found: ${params.path}`);
        }
        const content = (0, file_ops_1.readFileString)(fullPath);
        const lines = content.split('\n').map((line, idx) => ({
            number: idx + 1,
            content: line,
        }));
        return {
            path: params.path,
            lines,
            total_lines: lines.length,
        };
    }
    /**
     * Create a new file (only if it doesn't exist)
     */
    async createFile(params) {
        const fullPath = (0, file_ops_1.resolveProjectPath)(this.projectRoot, params.path);
        if (fs_extra_1.default.existsSync(fullPath)) {
            return { success: false, error: `File already exists: ${params.path}. Use edit_file_replace instead.` };
        }
        try {
            (0, file_ops_1.ensureDirectoryForFile)(fullPath);
            fs_extra_1.default.writeFileSync(fullPath, params.content, 'utf-8');
            await this.gitManager.commit(`Create file: ${params.path}`);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: `Failed to create file: ${error}` };
        }
    }
    /**
     * Replace an exact snippet in a file (surgical edit)
     * CRITICAL: old_snippet must match exactly including whitespace
     */
    async editFileReplace(params) {
        const fullPath = (0, file_ops_1.resolveProjectPath)(this.projectRoot, params.path);
        if (!fs_extra_1.default.existsSync(fullPath)) {
            return {
                success: false,
                error: {
                    type: 'FILE_NOT_FOUND',
                    message: `File not found: ${params.path}`,
                    suggestion: 'Check the file path and ensure it exists.',
                },
            };
        }
        const content = (0, file_ops_1.readFileString)(fullPath);
        const oldSnippet = params.old_snippet;
        const newSnippet = params.new_snippet;
        // Validate match
        const validation = (0, file_ops_1.validateSnippetMatch)(content, oldSnippet, params.expected_line);
        if (!validation.match) {
            this.editFailureCount.increment();
            // Build detailed error message
            let suggestion = 'The snippet does not match exactly. Use read_file to verify the exact content including indentation.';
            if (validation.actual) {
                suggestion = `Expected at line ${validation.line}:\n${validation.actual}\n\nPlease read the file again and copy the snippet exactly, preserving all spaces/tabs.`;
            }
            // Check for ambiguity
            const snippetLines = oldSnippet.split('\n');
            let matchCount = 0;
            for (let i = 0; i <= content.split('\n').length - snippetLines.length; i++) {
                const window = content.split('\n').slice(i, i + snippetLines.length).join('\n');
                if (window === oldSnippet) {
                    matchCount++;
                }
            }
            if (matchCount > 1) {
                return {
                    success: false,
                    error: {
                        type: 'AMBIGUOUS_MATCH',
                        message: `Snippet appears ${matchCount} times in file. Provide more context.`,
                        suggestion: 'Include more surrounding lines to make snippet unique.',
                    },
                };
            }
            return {
                success: false,
                error: {
                    type: 'SNIPPET_NOT_FOUND',
                    message: `Snippet not found in file ${params.path}`,
                    suggestion,
                    actual_content: validation.actual,
                },
            };
        }
        // Success - perform replacement
        const newContent = content.replace(oldSnippet, newSnippet);
        try {
            fs_extra_1.default.writeFileSync(fullPath, newContent, 'utf-8');
            await this.gitManager.commit(`Edit file: ${params.path}`);
            this.editFailureCount.reset();
            return {
                success: true,
                replaced_at_line: validation.line,
            };
        }
        catch (error) {
            // Try to rollback if commit failed
            try {
                await this.gitManager.rollback();
            }
            catch (rollbackError) {
                // Ignore rollback errors
            }
            return {
                success: false,
                error: {
                    type: 'SNIPPET_NOT_FOUND',
                    message: `Failed to write/commit file: ${error}`,
                    suggestion: 'Check file permissions and disk space.',
                },
            };
        }
    }
    /**
     * Edit a JSON file at a specific path using JSONPath
     */
    async editJsonValue(params) {
        const fullPath = (0, file_ops_1.resolveProjectPath)(this.projectRoot, params.path);
        if (!fs_extra_1.default.existsSync(fullPath)) {
            return {
                success: false,
                error: {
                    type: 'FILE_NOT_FOUND',
                    message: `File not found: ${params.path}`,
                },
            };
        }
        const result = (await Promise.resolve().then(() => __importStar(require('../utils/json-editor')))).editJsonValue(fullPath, params.json_path, params.new_value);
        if (result.success) {
            await this.gitManager.commit(`Edit JSON: ${params.path} at ${params.json_path}`);
        }
        return result;
    }
    /**
     * Rollback last action (git reset --hard HEAD~1)
     */
    async rollbackLastAction() {
        try {
            const previousHash = this.gitManager.getCurrentHash();
            const rolledBackHash = this.gitManager.rollback();
            return {
                success: true,
                rolled_back_commit: rolledBackHash,
                previous_state: previousHash ? 'DIRTY' : 'CLEAN',
            };
        }
        catch (error) {
            return {
                success: false,
                rolled_back_commit: '',
                previous_state: 'CLEAN',
                error: `Rollback failed: ${error}`,
            };
        }
    }
    /**
     * Get current edit failure count (for bail-out logic)
     */
    getEditFailureCount() {
        return this.editFailureCount.count;
    }
    /**
     * Reset edit failure count
     */
    resetEditFailures() {
        this.editFailureCount.reset();
    }
}
exports.FileEditor = FileEditor;
//# sourceMappingURL=file-editor.js.map