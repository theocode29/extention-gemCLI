/**
 * Resolve a path relative to the datapack project root
 * Prevents directory traversal outside the project
 */
export declare function resolveProjectPath(projectRoot: string, relativePath: string): string;
/**
 * Create directory recursively for a file path
 */
export declare function ensureDirectoryForFile(filePath: string): void;
/**
 * Read file as string
 */
export declare function readFileString(filePath: string): string;
/**
 * Write file atomically (write to temp then rename)
 */
export declare function writeFileAtomically(filePath: string, content: string): void;
/**
 * Validate that a snippet matches exactly (including whitespace)
 */
export declare function validateSnippetMatch(content: string, oldSnippet: string, expectedLine?: number): {
    match: boolean;
    line?: number;
    actual?: string;
};
//# sourceMappingURL=file-ops.d.ts.map