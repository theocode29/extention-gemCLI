import path from 'path';
import fs from 'fs-extra';
import { ShadowGitManager } from '../subsystems/ShadowGitManager';
import { resolveProjectPath } from '../utils/file-ops';

/**
 * Project Tools: scaffold_project, read_task_state, update_task_state
 */
export class ProjectTools {
  private gitManager: ShadowGitManager;
  private projectRoot: string;

  constructor(projectRoot: string, gitManager: ShadowGitManager) {
    this.projectRoot = projectRoot;
    this.gitManager = gitManager;
  }

  /**
   * Scaffold a new datapack project structure
   */
  async scaffoldProject(params: { version: string; datapack_name: string; namespace?: string; description?: string }): Promise<{
    success: boolean;
    path: string;
    git_initialized: boolean;
    files_created: string[];
    error?: string;
  }> {
    const { version, datapack_name, namespace = datapack_name.toLowerCase().replace(/\s+/g, '_'), description = '' } = params;

    try {
      // Validate Minecraft version format (e.g., "1.20.2")
      if (!/^\d+\.\d+\.\d+$/.test(version)) {
        return { success: false, path: '', git_initialized: false, files_created: [], error: `Invalid Minecraft version format: ${version}` };
      }

      const createdFiles: string[] = [];

      // Create root directories
      await fs.ensureDir(path.join(this.projectRoot, 'data', 'minecraft', 'tags', 'functions'));
      await fs.ensureDir(path.join(this.projectRoot, 'data', namespace, 'functions'));

      // pack.mcmeta
      const packMcmeta = {
        pack: {
          pack_format: this.getPackFormat(version),
          description: description || datapack_name,
        },
      };
      const mcmetaPath = path.join(this.projectRoot, 'pack.mcmeta');
      await fs.writeJSON(mcmetaPath, packMcmeta, { spaces: 2 });
      createdFiles.push('pack.mcmeta');

      // load.json - load tag
      const loadTag = { values: [`${namespace}:load`] };
      const loadPath = path.join(this.projectRoot, 'data', 'minecraft', 'tags', 'functions', 'load.json');
      await fs.writeJSON(loadPath, loadTag, { spaces: 2 });
      createdFiles.push('data/minecraft/tags/functions/load.json');

      // tick.json - tick tag
      const tickTag = { values: [`${namespace}:tick`] };
      const tickPath = path.join(this.projectRoot, 'data', 'minecraft', 'tags', 'functions', 'tick.json');
      await fs.writeJSON(tickPath, tickTag, { spaces: 2 });
      createdFiles.push('data/minecraft/tags/functions/tick.json');

      // data/<namespace>/functions/init/setup.mcfunction
      const setupDir = path.join(this.projectRoot, 'data', namespace, 'functions', 'init');
      await fs.ensureDir(setupDir);
      const setupContent = `# ${datapack_name} initialization\n# Called on load\nscoreboard objectives add ${namespace}_load dummy\n`;
      const setupPath = path.join(setupDir, 'setup.mcfunction');
      await fs.writeFile(setupPath, setupContent, 'utf-8');
      createdFiles.push(`data/${namespace}/functions/init/setup.mcfunction`);

      // data/<namespace>/functions/core/main.mcfunction
      const coreDir = path.join(this.projectRoot, 'data', namespace, 'functions', 'core');
      await fs.ensureDir(coreDir);
      const mainContent = `# Main tick function\n# Called every tick\n\n# Your code here\n`;
      const mainPath = path.join(coreDir, 'main.mcfunction');
      await fs.writeFile(mainPath, mainContent, 'utf-8');
      createdFiles.push(`data/${namespace}/functions/core/main.mcfunction`);

      // README.md
      const readme = `# ${datapack_name}\n\n${description}\n\n## Structure\n- \`data/${namespace}/functions/\`: Main function files\n- \`data/minecraft/tags/functions/\`: Load and tick tags\n\n## Installation\n1. Place this datapack in your world's datapacks folder\n2. Run \`/reload\`\n`;
      const readmePath = path.join(this.projectRoot, 'README.md');
      await fs.writeFile(readmePath, readme, 'utf-8');
      createdFiles.push('README.md');

      // Initialize shadow git
      const gitResult = await this.gitManager.initialize();
      const gitInitialized = gitResult.initialized;

      if (gitInitialized) {
        await this.gitManager.commit('Initial scaffold');
      }

      return {
        success: true,
        path: this.projectRoot,
        git_initialized: gitInitialized,
        files_created: createdFiles,
      };
    } catch (error) {
      return {
        success: false,
        path: this.projectRoot,
        git_initialized: false,
        files_created: [],
        error: `Scaffold failed: ${error}`,
      };
    }
  }

  /**
   * Read current task state from .gemini_tasks.json
   */
  async readTaskState(): Promise<import('../types').TaskState> {
    const statePath = path.join(this.projectRoot, '.gemini_tasks.json');

    const defaultState: import('../types').TaskState = {
      project: path.basename(this.projectRoot),
      version: '0.1.0',
      tasks: [],
      iteration: 0,
      last_updated: new Date().toISOString(),
    };

    if (!fs.existsSync(statePath)) {
      return defaultState;
    }

    try {
      const content = fs.readFileSync(statePath, 'utf-8');
      const data = JSON.parse(content);
      return { ...defaultState, ...data };
    } catch (error) {
      return defaultState;
    }
  }

  /**
   * Update a task's status
   */
  async updateTaskState(params: { task_id: string; new_status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'; notes?: string }): Promise<{
    success: boolean;
    error?: string;
    task?: import('../types').Task;
  }> {
    const statePath = path.join(this.projectRoot, '.gemini_tasks.json');

    let state: import('../types').TaskState;
    try {
      if (fs.existsSync(statePath)) {
        const content = fs.readFileSync(statePath, 'utf-8');
        state = JSON.parse(content);
      } else {
        state = await this.readTaskState();
      }
    } catch (error) {
      return { success: false, error: `Failed to read task state: ${error}` };
    }

    const taskIndex = state.tasks.findIndex(t => t.id === params.task_id);
    if (taskIndex === -1) {
      return { success: false, error: `Task not found: ${params.task_id}` };
    }

    // Update task
    state.tasks[taskIndex].status = params.new_status;
    state.tasks[taskIndex].updated_at = new Date().toISOString();
    if (params.notes !== undefined) {
      state.tasks[taskIndex].notes = params.notes;
    }

    state.last_updated = new Date().toISOString();

    // Write atomically
    try {
      const tempPath = statePath + '.tmp';
      fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf-8');
      fs.renameSync(tempPath, statePath);
      await this.gitManager.commit(`Update task ${params.task_id}: ${params.new_status}`);
      return { success: true, task: state.tasks[taskIndex] };
    } catch (error) {
      return { success: false, error: `Failed to write task state: ${error}` };
    }
  }

  /**
   * Get pack format for Minecraft version
   * Simplified mapping - production would need more complete mapping
   */
  private getPackFormat(version: string): number {
    const [major, minor] = version.split('.').map(Number);
    if (major === 1 && minor >= 20 && minor <= 20) return 18; // 1.20.x
    if (major === 1 && minor === 19) return 13; // 1.19.x
    if (major === 1 && minor === 18) return 9; // 1.18.x
    if (major === 1 && minor === 17) return 8; // 1.17.x
    return 12; // default fallback
  }
}
