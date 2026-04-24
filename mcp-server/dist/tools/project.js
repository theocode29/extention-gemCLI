"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectTools = void 0;
const path_1 = __importDefault(require("path"));
const fs_extra_1 = __importDefault(require("fs-extra"));
/**
 * Project Tools: scaffold_project, read_task_state, update_task_state
 */
class ProjectTools {
    gitManager;
    projectRoot;
    constructor(projectRoot, gitManager) {
        this.projectRoot = projectRoot;
        this.gitManager = gitManager;
    }
    /**
     * Scaffold a new datapack project structure
     */
    async scaffoldProject(params) {
        const { version, datapack_name, namespace = datapack_name.toLowerCase().replace(/\s+/g, '_'), description = '' } = params;
        try {
            // Validate Minecraft version format (e.g., "1.20.2")
            if (!/^\d+\.\d+\.\d+$/.test(version)) {
                return { success: false, path: '', git_initialized: false, files_created: [], error: `Invalid Minecraft version format: ${version}` };
            }
            const createdFiles = [];
            // Create root directories
            await fs_extra_1.default.ensureDir(path_1.default.join(this.projectRoot, 'data', 'minecraft', 'tags', 'functions'));
            await fs_extra_1.default.ensureDir(path_1.default.join(this.projectRoot, 'data', namespace, 'functions'));
            // pack.mcmeta
            const packMcmeta = {
                pack: {
                    pack_format: this.getPackFormat(version),
                    description: description || datapack_name,
                },
            };
            const mcmetaPath = path_1.default.join(this.projectRoot, 'pack.mcmeta');
            await fs_extra_1.default.writeJSON(mcmetaPath, packMcmeta, { spaces: 2 });
            createdFiles.push('pack.mcmeta');
            // load.json - load tag
            const loadTag = { values: [`${namespace}:load`] };
            const loadPath = path_1.default.join(this.projectRoot, 'data', 'minecraft', 'tags', 'functions', 'load.json');
            await fs_extra_1.default.writeJSON(loadPath, loadTag, { spaces: 2 });
            createdFiles.push('data/minecraft/tags/functions/load.json');
            // tick.json - tick tag
            const tickTag = { values: [`${namespace}:tick`] };
            const tickPath = path_1.default.join(this.projectRoot, 'data', 'minecraft', 'tags', 'functions', 'tick.json');
            await fs_extra_1.default.writeJSON(tickPath, tickTag, { spaces: 2 });
            createdFiles.push('data/minecraft/tags/functions/tick.json');
            // data/<namespace>/functions/init/setup.mcfunction
            const setupDir = path_1.default.join(this.projectRoot, 'data', namespace, 'functions', 'init');
            await fs_extra_1.default.ensureDir(setupDir);
            const setupContent = `# ${datapack_name} initialization\n# Called on load\nscoreboard objectives add ${namespace}_load dummy\n`;
            const setupPath = path_1.default.join(setupDir, 'setup.mcfunction');
            await fs_extra_1.default.writeFile(setupPath, setupContent, 'utf-8');
            createdFiles.push(`data/${namespace}/functions/init/setup.mcfunction`);
            // data/<namespace>/functions/core/main.mcfunction
            const coreDir = path_1.default.join(this.projectRoot, 'data', namespace, 'functions', 'core');
            await fs_extra_1.default.ensureDir(coreDir);
            const mainContent = `# Main tick function\n# Called every tick\n\n# Your code here\n`;
            const mainPath = path_1.default.join(coreDir, 'main.mcfunction');
            await fs_extra_1.default.writeFile(mainPath, mainContent, 'utf-8');
            createdFiles.push(`data/${namespace}/functions/core/main.mcfunction`);
            // README.md
            const readme = `# ${datapack_name}\n\n${description}\n\n## Structure\n- \`data/${namespace}/functions/\`: Main function files\n- \`data/minecraft/tags/functions/\`: Load and tick tags\n\n## Installation\n1. Place this datapack in your world's datapacks folder\n2. Run \`/reload\`\n`;
            const readmePath = path_1.default.join(this.projectRoot, 'README.md');
            await fs_extra_1.default.writeFile(readmePath, readme, 'utf-8');
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
        }
        catch (error) {
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
    async readTaskState() {
        const statePath = path_1.default.join(this.projectRoot, '.gemini_tasks.json');
        const defaultState = {
            project: path_1.default.basename(this.projectRoot),
            version: '0.1.0',
            tasks: [],
            iteration: 0,
            last_updated: new Date().toISOString(),
        };
        if (!fs_extra_1.default.existsSync(statePath)) {
            return defaultState;
        }
        try {
            const content = fs_extra_1.default.readFileSync(statePath, 'utf-8');
            const data = JSON.parse(content);
            return { ...defaultState, ...data };
        }
        catch (error) {
            return defaultState;
        }
    }
    /**
     * Update a task's status
     */
    async updateTaskState(params) {
        const statePath = path_1.default.join(this.projectRoot, '.gemini_tasks.json');
        let state;
        try {
            if (fs_extra_1.default.existsSync(statePath)) {
                const content = fs_extra_1.default.readFileSync(statePath, 'utf-8');
                state = JSON.parse(content);
            }
            else {
                state = await this.readTaskState();
            }
        }
        catch (error) {
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
            fs_extra_1.default.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf-8');
            fs_extra_1.default.renameSync(tempPath, statePath);
            await this.gitManager.commit(`Update task ${params.task_id}: ${params.new_status}`);
            return { success: true, task: state.tasks[taskIndex] };
        }
        catch (error) {
            return { success: false, error: `Failed to write task state: ${error}` };
        }
    }
    /**
     * Get pack format for Minecraft version
     * Simplified mapping - production would need more complete mapping
     */
    getPackFormat(version) {
        const [major, minor] = version.split('.').map(Number);
        if (major === 1 && minor >= 20 && minor <= 20)
            return 18; // 1.20.x
        if (major === 1 && minor === 19)
            return 13; // 1.19.x
        if (major === 1 && minor === 18)
            return 9; // 1.18.x
        if (major === 1 && minor === 17)
            return 8; // 1.17.x
        return 12; // default fallback
    }
}
exports.ProjectTools = ProjectTools;
//# sourceMappingURL=project.js.map