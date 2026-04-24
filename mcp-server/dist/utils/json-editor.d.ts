/**
 * Edit a JSON file at a specific JSONPath location
 * Uses jsonpath-plus for robust path selection
 */
export declare function editJsonValue(filePath: string, jsonPath: string, newValue: unknown): {
    success: boolean;
    previous_value?: unknown;
    new_value?: unknown;
    error?: string;
};
/**
 * Read a JSON file and optionally query a path
 */
export declare function readJsonFile(filePath: string, jsonPath?: string): {
    success: boolean;
    data?: unknown;
    error?: string;
};
//# sourceMappingURL=json-editor.d.ts.map