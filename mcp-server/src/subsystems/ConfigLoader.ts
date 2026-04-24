import path from 'path';
import fs from 'fs-extra';
import { ProjectConfig } from '../types';

export interface LoadedConfig extends Required<Omit<ProjectConfig, 'minecraftVersion'>> {
  projectRoot: string;
}

/**
 * Load configuration from .kilo/config.json or project root
 */
export function loadConfig(projectRoot: string): LoadedConfig {
  const configPath = path.join(projectRoot, '.kilo', 'config.json');

  const defaultConfig: LoadedConfig = {
    projectRoot,
    spyglass: {
      ignorePatterns: [],
    },
    libraryRegistryPath: './libraries',
    hitl: {
      autoBailoutEnabled: true,
      bailoutThreshold: 3,
    },
  };

  if (!fs.existsSync(configPath)) {
    return defaultConfig;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const userConfig = JSON.parse(content);

    // Deep merge with defaults
    return deepMerge(defaultConfig, userConfig);
  } catch (error) {
    console.warn(`Failed to load config: ${error}, using defaults`);
    return defaultConfig;
  }
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const output = { ...target };

  for (const key in source) {
    if (source[key] instanceof Object && key in target && target[key] instanceof Object) {
      // @ts-ignore
      output[key] = deepMerge(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
    } else {
      // @ts-ignore
      output[key] = source[key];
    }
  }

  return output;
}
