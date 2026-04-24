import { ShadowGitManager } from '../subsystems/ShadowGitManager';
export interface FileEditorOptions {
    gitManager: ShadowGitManager;
    projectRoot: string;
    editFailureCount: {
        count: number;
        reset: () => void;
        increment: () => void;
    };
}
/**
 * File Editor Tools
 * Handles reading, creating, editing files with surgical precision
 */
export declare class FileEditor {
    private gitManager;
    private projectRoot;
    private editFailureCount;
    constructor(options: FileEditorOptions);
    /**
     * Read a file and return numbered lines
     */
    readFile(params: {
        path: string;
    }): Promise<import('../types').ReadFileResult>;
    /**
     * Create a new file (only if it doesn't exist)
     */
    createFile(params: {
        path: string;
        content: string;
    }): Promise<{
        success: boolean;
        error?: string;
    }>;
    /**
     * Replace an exact snippet in a file (surgical edit)
     * CRITICAL: old_snippet must match exactly including whitespace
     */
    editFileReplace(params: import('../types').EditFileReplaceParams): Promise<import('../types').EditFileReplaceResult>;
    /**
     * Edit a JSON file at a specific path using JSONPath
     */
    editJsonValue(params: import('../types').EditJsonValueParams): Promise<import('../types').EditJsonValueResult>;
    /**
     * Rollback last action (git reset --hard HEAD~1)
     */
    rollbackLastAction(): Promise<import('../types').RollbackResult>;
    /**
     * Get current edit failure count (for bail-out logic)
     */
    getEditFailureCount(): number;
    /**
     * Reset edit failure count
     */
    resetEditFailures(): void;
}
//# sourceMappingURL=file-editor.d.ts.map