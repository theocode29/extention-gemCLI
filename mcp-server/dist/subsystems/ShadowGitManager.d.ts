/**
 * ShadowGitManager handles all Git operations for the datapack project.
 * All modifications are automatically committed before changes.
 * Rollbacks use git reset --hard HEAD~1 to undo the last commit.
 */
export declare class ShadowGitManager {
    private projectRoot;
    private lastCommitHash;
    private isInitialized;
    constructor(projectRoot: string);
    /**
     * Initialize shadow git repository if not exists
     */
    initialize(): Promise<{
        initialized: boolean;
        initialCommit: string | null;
    }>;
    /**
     * Commit all changes with a descriptive message
     * Returns the commit hash
     */
    commit(message: string): string;
    /**
     * Rollback the last commit (undo last action)
     * Returns the previous commit hash
     */
    rollback(): string;
    /**
     * Get current HEAD commit hash
     */
    getCurrentHash(): string;
    /**
     * Get git status (modified files)
     */
    status(): string[];
    /**
     * Get the last commit hash stored in memory
     */
    getLastCommitHash(): string | null;
    /**
     * Check if git is initialized
     */
    getIsInitialized(): boolean;
    /**
     * Get project root path
     */
    getProjectRoot(): string;
}
//# sourceMappingURL=ShadowGitManager.d.ts.map