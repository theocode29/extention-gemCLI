"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadConfig = loadConfig;
const path_1 = __importDefault(require("path"));
const fs_extra_1 = __importDefault(require("fs-extra"));
/**
 * Load configuration from .kilo/config.json or project root
 */
function loadConfig(projectRoot) {
    const configPath = path_1.default.join(projectRoot, '.kilo', 'config.json');
    const defaultConfig = {
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
    if (!fs_extra_1.default.existsSync(configPath)) {
        return defaultConfig;
    }
    try {
        const content = fs_extra_1.default.readFileSync(configPath, 'utf-8');
        const userConfig = JSON.parse(content);
        // Deep merge with defaults
        return deepMerge(defaultConfig, userConfig);
    }
    catch (error) {
        console.warn(`Failed to load config: ${error}, using defaults`);
        return defaultConfig;
    }
}
function deepMerge(target, source) {
    const output = { ...target };
    for (const key in source) {
        if (source[key] instanceof Object && key in target && target[key] instanceof Object) {
            // @ts-ignore
            output[key] = deepMerge(target[key], source[key]);
        }
        else {
            // @ts-ignore
            output[key] = source[key];
        }
    }
    return output;
}
//# sourceMappingURL=ConfigLoader.js.map