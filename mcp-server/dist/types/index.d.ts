export interface Task {
    id: string;
    description: string;
    status: "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED";
    dependencies?: string[];
    plan?: string;
    created_at: string;
    updated_at?: string;
    notes?: string;
}
export interface TaskState {
    project: string;
    version: string;
    tasks: Task[];
    current_focus?: string;
    iteration: number;
    last_updated: string;
}
export interface FileLine {
    number: number;
    content: string;
}
export interface ReadFileResult {
    path: string;
    lines: FileLine[];
    total_lines: number;
}
export interface EditFileReplaceParams {
    path: string;
    old_snippet: string;
    new_snippet: string;
    expected_line?: number;
}
export interface EditFileReplaceResult {
    success: boolean;
    replaced_at_line?: number;
    error?: {
        type: "SNIPPET_NOT_FOUND" | "AMBIGUOUS_MATCH" | "FILE_NOT_FOUND" | "INDENTATION_MISMATCH";
        message: string;
        suggestion: string;
        actual_content?: string;
    };
}
export interface EditJsonValueParams {
    path: string;
    json_path: string;
    new_value: unknown;
}
export interface EditJsonValueResult {
    success: boolean;
    previous_value?: unknown;
    new_value?: unknown;
    error?: {
        type: "JSON_PARSE_ERROR" | "PATH_NOT_FOUND" | "TYPE_MISMATCH" | "FILE_NOT_FOUND";
        message: string;
    };
}
export interface RollbackResult {
    success: boolean;
    rolled_back_commit: string;
    previous_state: "CLEAN" | "DIRTY";
}
export interface ScaffoldProjectParams {
    version: string;
    datapack_name: string;
    namespace?: string;
    description?: string;
}
export interface ScaffoldProjectResult {
    success: boolean;
    path: string;
    git_initialized: boolean;
    files_created: string[];
    error?: string;
}
export interface SpyglassDiagnostic {
    file: string;
    range: {
        start: {
            line: number;
            character: number;
        };
        end: {
            line: number;
            character: number;
        };
    };
    severity: "Error" | "Warning" | "Hint" | "Information";
    code: string;
    message: string;
    source: string;
}
export interface SpyglassOutput {
    uri: string;
    diagnostics: SpyglassDiagnostic[];
}
export interface SmartLinterParams {
    target_file?: string;
    strict?: boolean;
}
export interface SmartLinterResult {
    status: "PASS" | "PASS_WITH_WARNINGS" | "FAIL";
    errors: Array<SpyglassDiagnostic & {
        severity: "ERROR";
    }>;
    warnings: Array<SpyglassDiagnostic & {
        severity: "WARNING";
        performance_impact?: "LOW" | "MEDIUM" | "HIGH";
    }>;
    filtered_count: number;
    execution_time_ms?: number;
}
export interface LibraryCapability {
    name: string;
    libraries: Array<{
        lib_name: string;
        namespace: string;
        tags: string[];
        snippet_preview: string;
    }>;
    total_matches: number;
}
export interface RequestCapabilityParams {
    capability: string;
    context_tags?: string[];
    purpose?: string;
}
export interface RequestCapabilityResult {
    selected_library: string;
    namespace: string;
    snippet: string;
    snippet_path: string;
    relevance_score: number;
    alternatives: Array<{
        lib_name: string;
        score: number;
        reason: string;
    }>;
}
export interface LinkLibraryParams {
    library_name: string;
    version?: string;
}
export interface LinkLibraryResult {
    library_path: string;
    namespace: string;
    load_tag_injected: boolean;
    tick_tag_injected: boolean;
    already_linked: boolean;
}
export interface LibManifest {
    name: string;
    namespace: string;
    version: string;
    description?: string;
    requires_load_tag?: string;
    requires_tick_tag?: string;
    dependencies?: string[];
    spyglass_ignore_paths: string[];
    capabilities: {
        [capability: string]: {
            tags: string[];
            snippet_file: string;
            description?: string;
            examples?: string[];
        };
    };
    author?: string;
    license?: string;
    repository?: string;
}
export interface RequestHumanReviewParams {
    reason: string;
    warnings?: string[];
    context?: {
        file?: string;
        line?: number;
        attempted_snippet?: string;
    };
    suggested_action?: string;
    timeout_seconds?: number;
}
export interface HumanReviewResult {
    approved: boolean;
    feedback?: string;
    override_snippet?: string;
}
export interface UpdateTaskStateParams {
    task_id: string;
    new_status: "TODO" | "IN_PROGRESS" | "DONE" | "BLOCKED";
    notes?: string;
}
export interface ProjectConfig {
    spyglass?: {
        ignorePatterns?: string[];
    };
    libraryRegistryPath?: string;
    hitl?: {
        autoBailoutEnabled?: boolean;
        bailoutThreshold?: number;
    };
    minecraftVersion?: string;
}
//# sourceMappingURL=index.d.ts.map