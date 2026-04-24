import fs from 'fs';
import { JSONPath } from 'jsonpath-plus';

/**
 * Edit a JSON file at a specific JSONPath location
 * Uses jsonpath-plus for robust path selection
 */
export function editJsonValue(filePath: string, jsonPath: string, newValue: unknown): { success: boolean; previous_value?: unknown; new_value?: unknown; error?: string } {
  if (!fs.existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  let jsonContent: unknown;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    jsonContent = JSON.parse(content);
  } catch (error) {
    return { success: false, error: `JSON parse error: ${error}` };
  }

  // Find the target using JSONPath
  try {
    const result = JSONPath({
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
    JSONPath({
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
    fs.writeFileSync(filePath, serialized, 'utf-8');

    return {
      success: true,
      previous_value: previousValue,
      new_value: newValue,
    };
  } catch (error) {
    return { success: false, error: `JSONPath error: ${error}` };
  }
}

/**
 * Read a JSON file and optionally query a path
 */
export function readJsonFile(filePath: string, jsonPath?: string): { success: boolean; data?: unknown; error?: string } {
  if (!fs.existsSync(filePath)) {
    return { success: false, error: `File not found: ${filePath}` };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);

    if (jsonPath) {
      const result = JSONPath({
        path: jsonPath,
        json: data,
        resultType: 'value',
        wrap: false,
      });
      return { success: true, data: result };
    }

    return { success: true, data };
  } catch (error) {
    return { success: false, error: `JSON error: ${error}` };
  }
}
