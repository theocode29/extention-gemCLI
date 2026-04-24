"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShadowGitManager = void 0;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
/**
 * ShadowGitManager handles all Git operations for the datapack project.
 * All modifications are automatically committed before changes.
 * Rollbacks use git reset --hard HEAD~1 to undo the last commit.
 */
class ShadowGitManager {
    projectRoot;
    lastCommitHash = null;
    isInitialized = false;
    constructor(projectRoot) {
        this.projectRoot = path_1.default.resolve(projectRoot);
    }
    /**
     * Initialize shadow git repository if not exists
     */
    async initialize() {
        const gitDir = path_1.default.join(this.projectRoot, '.git');
        if (fs_1.default.existsSync(gitDir)) {
            this.isInitialized = true;
            return { initialized: true, initialCommit: null };
        }
        try {
            (0, child_process_1.execSync)('git init', { cwd: this.projectRoot, stdio: 'pipe' });
            (0, child_process_1.execSync)('git config user.email "gemini-agent@example.com"', { cwd: this.projectRoot, stdio: 'pipe' });
            (0, child_process_1.execSync)('git config user.name "Gemini Datapack Agent"', { cwd: this.projectRoot, stdio: 'pipe' });
            (0, child_process_1.execSync)('git add .', { cwd: this.projectRoot, stdio: 'pipe' });
            (0, child_process_1.execSync)('git commit -m "Initial scaffold"', { cwd: this.projectRoot, stdio: 'pipe' });
            this.isInitialized = true;
            this.lastCommitHash = this.getCurrentHash();
            return { initialized: true, initialCommit: this.lastCommitHash };
        }
        catch (error) {
            throw new Error(`Failed to initialize git repository: ${error}`);
        }
    }
    /**
     * Commit all changes with a descriptive message
     * Returns the commit hash
     */
    commit(message) {
        if (!this.isInitialized) {
            throw new Error('Git manager not initialized');
        }
        try {
            (0, child_process_1.execSync)('git add .', { cwd: this.projectRoot, stdio: 'pipe' });
            (0, child_process_1.execSync)(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: this.projectRoot, stdio: 'pipe' });
            this.lastCommitHash = this.getCurrentHash();
            return this.lastCommitHash;
        }
        catch (error) {
            // If nothing to commit, git commit fails - that's okay
            const stderr = error instanceof Error ? error.message : String(error);
            if (stderr.includes('nothing to commit')) {
                return this.lastCommitHash || '';
            }
            throw new Error(`Git commit failed: ${stderr}`);
        }
    }
    /**
     * Rollback the last commit (undo last action)
     * Returns the previous commit hash
     */
    rollback() {
        if (!this.isInitialized) {
            throw new Error('Git manager not initialized');
        }
        const previousHash = this.getCurrentHash();
        try {
            (0, child_process_1.execSync)('git reset --hard HEAD~1', { cwd: this.projectRoot, stdio: 'pipe' });
            // Also clean up untracked files that were added in the last commit
            (0, child_process_1.execSync)('git clean -fd', { cwd: this.projectRoot, stdio: 'pipe' });
        }
        catch (error) {
            throw new Error(`Git rollback failed: ${error}`);
        }
        return previousHash;
    }
    /**
     * Get current HEAD commit hash
     */
    getCurrentHash() {
        try {
            const output = (0, child_process_1.execSync)('git rev-parse HEAD', { cwd: this.projectRoot, stdio: 'pipe' });
            return output.toString().trim();
        }
        catch (error) {
            return '';
        }
    }
    /**
     * Get git status (modified files)
     */
    status() {
        try {
            const output = (0, child_process_1.execSync)('git status --porcelain', { cwd: this.projectRoot, stdio: 'pipe' });
            const lines = output.toString().trim().split('\n').filter(line => line.length > 0);
            return lines.map(line => line.slice(3).trim());
        }
        catch (error) {
            return [];
        }
    }
    /**
     * Get the last commit hash stored in memory
     */
    getLastCommitHash() {
        return this.lastCommitHash;
    }
    /**
     * Check if git is initialized
     */
    getIsInitialized() {
        return this.isInitialized;
    }
    /**
     * Get project root path
     */
    getProjectRoot() {
        return this.projectRoot;
    }
}
exports.ShadowGitManager = ShadowGitManager;
//# sourceMappingURL=ShadowGitManager.js.map