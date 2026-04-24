import path from 'path';
import fs from 'fs-extra';
import { ShadowGitManager } from '../subsystems/ShadowGitManager';
import { resolveProjectPath, ensureDirectoryForFile, readFileString, validateSnippetMatch } from '../utils/file-ops';

export interface FileEditorOptions {
  gitManager: ShadowGitManager;
  projectRoot: string;
  editFailureCount: { count: number; reset: () => void; increment: () => void };
}

/**
 * File Editor Tools
 * Handles reading, creating, editing files with surgical precision
 */
export class FileEditor {
  private gitManager: ShadowGitManager;
  private projectRoot: string;
  private editFailureCount: { count: number; reset: () => void; increment: () => void };

  constructor(options: FileEditorOptions) {
    this.gitManager = options.gitManager;
    this.projectRoot = options.projectRoot;
    this.editFailureCount = options.editFailureCount;
  }

  /**
   * Read a file and return numbered lines
   */
  async readFile(params: { path: string }): Promise<import('../types').ReadFileResult> {
    const fullPath = resolveProjectPath(this.projectRoot, params.path);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${params.path}`);
    }

    const content = readFileString(fullPath);
    const lines = content.split('\n').map((line: string, idx: number) => ({
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
  async createFile(params: { path: string; content: string }): Promise<{ success: boolean; error?: string }> {
    const fullPath = resolveProjectPath(this.projectRoot, params.path);

    if (fs.existsSync(fullPath)) {
      return { success: false, error: `File already exists: ${params.path}. Use edit_file_replace instead.` };
    }

    try {
      ensureDirectoryForFile(fullPath);
      fs.writeFileSync(fullPath, params.content, 'utf-8');
      await this.gitManager.commit(`Create file: ${params.path}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: `Failed to create file: ${error}` };
    }
  }

  /**
   * Replace an exact snippet in a file (surgical edit)
   * CRITICAL: old_snippet must match exactly including whitespace
   */
  async editFileReplace(params: import('../types').EditFileReplaceParams): Promise<import('../types').EditFileReplaceResult> {
    const fullPath = resolveProjectPath(this.projectRoot, params.path);

    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        error: {
          type: 'FILE_NOT_FOUND',
          message: `File not found: ${params.path}`,
          suggestion: 'Check the file path and ensure it exists.',
        },
      };
    }

    const content = readFileString(fullPath);
    const oldSnippet = params.old_snippet;
    const newSnippet = params.new_snippet;

    // Validate match
    const validation = validateSnippetMatch(content, oldSnippet, params.expected_line);

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
      fs.writeFileSync(fullPath, newContent, 'utf-8');
      await this.gitManager.commit(`Edit file: ${params.path}`);
      this.editFailureCount.reset();

      return {
        success: true,
        replaced_at_line: validation.line,
      };
    } catch (error) {
      // Try to rollback if commit failed
      try {
        await this.gitManager.rollback();
      } catch (rollbackError) {
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
  async editJsonValue(params: import('../types').EditJsonValueParams): Promise<import('../types').EditJsonValueResult> {
    const fullPath = resolveProjectPath(this.projectRoot, params.path);

    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        error: {
          type: 'FILE_NOT_FOUND',
          message: `File not found: ${params.path}`,
        },
      };
    }

    const result = (await import('../utils/json-editor')).editJsonValue(fullPath, params.json_path, params.new_value);

    if (result.success) {
      await this.gitManager.commit(`Edit JSON: ${params.path} at ${params.json_path}`);
    }

    return result;
  }

  /**
   * Rollback last action (git reset --hard HEAD~1)
   */
  async rollbackLastAction(): Promise<import('../types').RollbackResult> {
    try {
      const previousHash = this.gitManager.getCurrentHash();
      const rolledBackHash = this.gitManager.rollback();

      return {
        success: true,
        rolled_back_commit: rolledBackHash,
        previous_state: previousHash ? 'DIRTY' : 'CLEAN',
      };
    } catch (error) {
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
  getEditFailureCount(): number {
    return this.editFailureCount.count;
  }

  /**
   * Reset edit failure count
   */
  resetEditFailures(): void {
    this.editFailureCount.reset();
  }
}
