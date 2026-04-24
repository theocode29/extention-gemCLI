import path from 'path';
import fs from 'fs';

/**
 * Resolve a path relative to the datapack project root
 * Prevents directory traversal outside the project
 */
export function resolveProjectPath(projectRoot: string, relativePath: string): string {
  const fullPath = path.resolve(projectRoot, relativePath);

  // Security: ensure path is within project root
  if (!fullPath.startsWith(projectRoot)) {
    throw new Error(`Path traversal detected: ${relativePath}`);
  }

  return fullPath;
}

/**
 * Create directory recursively for a file path
 */
export function ensureDirectoryForFile(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Read file as string
 */
export function readFileString(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Write file atomically (write to temp then rename)
 */
export function writeFileAtomically(filePath: string, content: string): void {
  ensureDirectoryForFile(filePath);
  const tempPath = filePath + '.tmp';
  fs.writeFileSync(tempPath, content, 'utf-8');
  fs.renameSync(tempPath, filePath);
}

/**
 * Validate that a snippet matches exactly (including whitespace)
 */
export function validateSnippetMatch(content: string, oldSnippet: string, expectedLine?: number): { match: boolean; line?: number; actual?: string } {
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
