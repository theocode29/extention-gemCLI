import { ShadowGitManager } from '../subsystems/ShadowGitManager';
/**
 * Project Tools: scaffold_project, read_task_state, update_task_state
 */
export declare class ProjectTools {
    private gitManager;
    private projectRoot;
    constructor(projectRoot: string, gitManager: ShadowGitManager);
    /**
     * Scaffold a new datapack project structure
     */
    scaffoldProject(params: {
        version: string;
        datapack_name: string;
        namespace?: string;
        description?: string;
    }): Promise<{
        success: boolean;
        path: string;
        git_initialized: boolean;
        files_created: string[];
        error?: string;
    }>;
    /**
     * Read current task state from .gemini_tasks.json
     */
    readTaskState(): Promise<import('../types').TaskState>;
    /**
     * Update a task's status
     */
    updateTaskState(params: {
        task_id: string;
        new_status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';
        notes?: string;
    }): Promise<{
        success: boolean;
        error?: string;
        task?: import('../types').Task;
    }>;
    /**
     * Get pack format for Minecraft version
     * Simplified mapping - production would need more complete mapping
     */
    private getPackFormat;
}
//# sourceMappingURL=project.d.ts.map