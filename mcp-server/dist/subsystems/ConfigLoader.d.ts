import { ProjectConfig } from '../types';
export interface LoadedConfig extends Required<Omit<ProjectConfig, 'minecraftVersion'>> {
    projectRoot: string;
}
/**
 * Load configuration from .kilo/config.json or project root
 */
export declare function loadConfig(projectRoot: string): LoadedConfig;
//# sourceMappingURL=ConfigLoader.d.ts.map