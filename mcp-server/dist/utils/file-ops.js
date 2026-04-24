"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveProjectPath = resolveProjectPath;
exports.ensureDirectoryForFile = ensureDirectoryForFile;
exports.readFileString = readFileString;
exports.writeFileAtomically = writeFileAtomically;
exports.validateSnippetMatch = validateSnippetMatch;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
/**
 * Resolve a path relative to the datapack project root
 * Prevents directory traversal outside the project
 */
function resolveProjectPath(projectRoot, relativePath) {
    const fullPath = path_1.default.resolve(projectRoot, relativePath);
    // Security: ensure path is within project root
    if (!fullPath.startsWith(projectRoot)) {
        throw new Error(`Path traversal detected: ${relativePath}`);
    }
    return fullPath;
}
/**
 * Create directory recursively for a file path
 */
function ensureDirectoryForFile(filePath) {
    const dir = path_1.default.dirname(filePath);
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
}
/**
 * Read file as string
 */
function readFileString(filePath) {
    if (!fs_1.default.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }
    return fs_1.default.readFileSync(filePath, 'utf-8');
}
/**
 * Write file atomically (write to temp then rename)
 */
function writeFileAtomically(filePath, content) {
    ensureDirectoryForFile(filePath);
    const tempPath = filePath + '.tmp';
    fs_1.default.writeFileSync(tempPath, content, 'utf-8');
    fs_1.default.renameSync(tempPath, filePath);
}
/**
 * Validate that a snippet matches exactly (including whitespace)
 */
function validateSnippetMatch(content, oldSnippet, expectedLine) {
    const lines = content.split('\n');
    // Search for exact match
    for (let i = 0; i < lines.length; i++) {
        const window = lines.slice(i, i + oldSnippet.split('\n').length).join('\n');
        if (window === oldSnippet) {
            return { match: true, line: i + 1 };
        }
    }
    // If expected line provided, show what's actually there
    if (expectedLine && expectedLine > 0 && expectedLine <= lines.length) {
        const startIdx = expectedLine - 1;
        const windowSize = oldSnippet.split('\n').length;
        const actual = lines.slice(startIdx, startIdx + windowSize).join('\n');
        return { match: false, line: expectedLine, actual };
    }
    return { match: false };
}
//# sourceMappingURL=file-ops.js.map