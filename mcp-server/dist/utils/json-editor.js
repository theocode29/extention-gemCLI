"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.editJsonValue = editJsonValue;
exports.readJsonFile = readJsonFile;
const fs_1 = __importDefault(require("fs"));
const jsonpath_plus_1 = require("jsonpath-plus");
/**
 * Edit a JSON file at a specific JSONPath location
 * Uses jsonpath-plus for robust path selection
 */
function editJsonValue(filePath, jsonPath, newValue) {
    if (!fs_1.default.existsSync(filePath)) {
        return { success: false, error: `File not found: ${filePath}` };
    }
    let jsonContent;
    try {
        const content = fs_1.default.readFileSync(filePath, 'utf-8');
        jsonContent = JSON.parse(content);
    }
    catch (error) {
        return { success: false, error: `JSON parse error: ${error}` };
    }
    // Find the target using JSONPath
    try {
        const result = (0, jsonpath_plus_1.JSONPath)({
            path: jsonPath,
            json: jsonContent,
            resultType: 'value',
            wrap: false,
        });
        if (!result || result.length === 0) {
            return { success: false, error: `Path not found: ${jsonPath}` };
        }
        // Store previous value of first match
        const previousValue = result[0];
        // Modify the JSON
        (0, jsonpath_plus_1.JSONPath)({
            path: jsonPath,
            json: jsonContent,
            resultType: 'value',
            wrap: false,
            callback: () => newValue,
        });
        // Validate JSON after modification
        const serialized = JSON.stringify(jsonContent, null, 2);
        JSON.parse(serialized); // Verify valid
        // Write back
        fs_1.default.writeFileSync(filePath, serialized, 'utf-8');
        return {
            success: true,
            previous_value: previousValue,
            new_value: newValue,
        };
    }
    catch (error) {
        return { success: false, error: `JSONPath error: ${error}` };
    }
}
/**
 * Read a JSON file and optionally query a path
 */
function readJsonFile(filePath, jsonPath) {
    if (!fs_1.default.existsSync(filePath)) {
        return { success: false, error: `File not found: ${filePath}` };
    }
    try {
        const content = fs_1.default.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        if (jsonPath) {
            const result = (0, jsonpath_plus_1.JSONPath)({
                path: jsonPath,
                json: data,
                resultType: 'value',
                wrap: false,
            });
            return { success: true, data: result };
        }
        return { success: true, data };
    }
    catch (error) {
        return { success: false, error: `JSON error: ${error}` };
    }
}
//# sourceMappingURL=json-editor.js.map