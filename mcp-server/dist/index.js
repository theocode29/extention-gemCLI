import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, GetPromptRequestSchema, ListPromptsRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { BONESemanticLinter } from "./BONESemanticLinter.js";
import { BookshelfEngine } from "./BookshelfEngine.js";
import { BONEEngine } from "./BONEEngine.js";
import { DatapackInitEngine } from "./DatapackInitEngine.js";
import { ProjectStateManager } from "./ProjectStateManager.js";
import { MissionStateManager } from "./MissionStateManager.js";
import { DatapackContractValidator } from "./DatapackContractValidator.js";
import { CAPABILITIES, CapabilityCatalogManager } from "./CapabilityCatalog.js";
import { DocSearchEngine } from "./DocSearchEngine.js";
import { SpyglassRunner } from "./SpyglassRunner.js";
import { CircuitBreaker } from "./CircuitBreaker.js";
import { spawn } from "child_process";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = process.env.MCP_PROJECT_ROOT || process.cwd();
const ExecutionPhaseSchema = z.enum([
    "phase0_audit",
    "phase1_cadrage",
    "phase2_plan",
    "phase3_execution",
    "phase4_validation",
    "phase5_livraison",
]);
const MissionStatusSchema = z.enum([
    "draft",
    "research_blocked",
    "awaiting_go",
    "debate_in_progress",
    "in_progress",
    "waiting_human",
    "validation_blocked_headless",
    "blocked",
    "completed",
    "conditional_delivery",
]);
const ResearchSourceSchema = z.object({
    id: z.string().min(1),
    kind: z.enum(["library_doc", "minecraft_runtime_doc", "internal_doc"]),
    title: z.string().min(1),
    urlOrPath: z.string().min(1),
    summary: z.string().min(1),
});
const ResearchCollectSchema = z.object({
    sources: z.array(ResearchSourceSchema).optional(),
    constraints: z.array(z.string()).optional(),
    chosen_modules: z.array(z.string()).optional(),
    rejected_modules: z.array(z.string()).optional(),
    use_case_class: z.string().optional(),
    evidence_map: z.record(z.array(z.string())).optional(),
    module_candidates: z.array(z.string()).optional(),
    physics_model: z.string().optional(),
});
const ResearchValidateSchema = z.object({
    min_sources: z.number().int().min(3).optional(),
});
const PlanDuelStartSchema = z.object({
    planner: z.object({
        proposal: z.string().min(1),
        risks: z.array(z.string()).default([]),
        score: z.number().min(0).max(100).default(50),
    }),
    critic: z.object({
        proposal: z.string().min(1),
        risks: z.array(z.string()).default([]),
        score: z.number().min(0).max(100).default(50),
    }),
});
const PlanDuelResolveSchema = z.object({
    winner: z.enum(["planner", "critic", "hybrid"]),
    kept: z.array(z.string()).default([]),
    rejected: z.array(z.string()).default([]),
    tradeoffs: z.array(z.string()).default([]),
    risk_acceptance: z.string().default("acceptable"),
    rationale: z.string().min(1),
});
const ConstraintsSchema = z.object({
    version: z.string().optional(),
    performance: z.enum(["low", "medium", "high"]).optional(),
    no_external_lib: z.boolean().optional(),
}).passthrough();
const LibraryRouteSchema = z.object({
    task: z.string().min(1),
    requested_capabilities: z.array(z.enum(CAPABILITIES)).optional(),
    constraints: ConstraintsSchema.optional(),
    requires_custom_items_or_blocks: z.boolean().optional(),
    runtime_impacting: z.boolean().optional(),
    require_evidence: z.boolean().optional(),
});
const ContractValidateSchema = z.object({
    fail_on_warning: z.boolean().optional(),
});
const PhysicsProfileApplySchema = z.object({
    namespace: z.string().min(1),
    profile_name: z.string().min(1).default("default_surface_physics"),
    surfaces: z.array(z.object({
        block_tag_or_id: z.string().min(1),
        restitution: z.number().min(0).max(1.5),
        friction: z.number().min(0).max(1),
        speed_factor: z.number().min(0).max(4).default(1),
    })),
    gravity_per_tick: z.number().min(0).max(5).default(0.08),
});
const LoopGuardCheckSchema = z.object({
    signature: z.string().min(1),
    repeated_limit: z.number().int().min(1).max(20).default(3),
});
const MissionPlanCreateSchema = z.object({
    objective: z.string().min(1),
    assumptions: z.array(z.string()).optional(),
    decisions: z.array(z.string()).optional(),
    backlog: z
        .array(z.object({
        id: z.string().optional(),
        title: z.string().min(1),
        done: z.boolean().optional(),
    }))
        .optional(),
    next_action: z.string().optional(),
});
const MissionPlanUpdateSchema = z.object({
    objective: z.string().optional(),
    assumptions: z.array(z.string()).optional(),
    decisions: z.array(z.string()).optional(),
    backlog: z
        .array(z.object({
        id: z.string(),
        title: z.string().optional(),
        done: z.boolean().optional(),
    }))
        .optional(),
    blockers: z.array(z.string()).optional(),
    next_action: z.string().optional(),
    status: MissionStatusSchema.optional(),
    requires_human: z.boolean().optional(),
    gate: z.enum(["planApproved", "assetsReady", "finalApproved"]).optional(),
    gate_value: z.boolean().optional(),
    contract_passed: z.boolean().optional(),
    headless_required: z.boolean().optional(),
    headless_passed: z.boolean().optional(),
    runtime_impacting: z.boolean().optional(),
});
const PhaseAdvanceSchema = z.object({
    phase: ExecutionPhaseSchema,
    status: MissionStatusSchema.optional(),
    next_action: z.string().optional(),
    requires_human: z.boolean().optional(),
});
const CheckpointGetSchema = z.object({
    key: z.string().min(1),
});
const CheckpointSetSchema = z.object({
    key: z.string().min(1),
    value: z.string(),
});
const MissionReadWriteSchema = z.object({
    objective: z.string().optional(),
    assumptions: z.array(z.string()).optional(),
    decisions: z.array(z.string()).optional(),
    backlog: z
        .array(z.object({
        id: z.string(),
        title: z.string().optional(),
        done: z.boolean().optional(),
    }))
        .optional(),
    blockers: z.array(z.string()).optional(),
    next_action: z.string().optional(),
    status: MissionStatusSchema.optional(),
    requires_human: z.boolean().optional(),
    gate: z.enum(["planApproved", "assetsReady", "finalApproved"]).optional(),
    gate_value: z.boolean().optional(),
    contract_passed: z.boolean().optional(),
    headless_required: z.boolean().optional(),
    headless_passed: z.boolean().optional(),
    runtime_impacting: z.boolean().optional(),
});
const CapabilityCatalogRefreshSchema = z.object({
    force_remote: z.boolean().optional(),
});
const CapabilityCatalogGetSchema = z.object({
    capabilities: z.array(z.enum(CAPABILITIES)).optional(),
});
const promptRegistry = [
    {
        name: "mcp-dp-init",
        description: "Initialize a version-aware datapack workspace.",
        arguments: [
            {
                name: "version",
                description: "Target Minecraft Java version (example: 1.21.5).",
                required: true,
            },
            {
                name: "namespace",
                description: "Namespace for the datapack (lowercase, digits, _, ., -).",
                required: true,
            },
            {
                name: "profile",
                description: "Optional profile: minimal|worldgen|tests|full (default minimal).",
                required: false,
            },
        ],
        build: ({ version, namespace, profile }) => [
            "Initialize the datapack workspace with version-aware structure.",
            `Requested target version: ${version}`,
            `Requested namespace: ${namespace}`,
            `Requested profile: ${profile && profile.length > 0 ? profile : "minimal"}`,
            "Call tool fs_project_init with:",
            `{"version":"${version}","namespace":"${namespace}","profile":"${profile && profile.length > 0 ? profile : "minimal"}"}`,
            "Then summarize the initialization result and next setup actions.",
        ].join("\n"),
    },
    {
        name: "mcp-dp-ingest",
        description: "Refresh BONE + Bookshelf knowledge index.",
        build: () => [
            "Refresh the internal RAG/index knowledge.",
            "Call tool bone_ingest_template with empty arguments.",
            "Return a concise summary of what was indexed.",
        ].join("\n"),
    },
    {
        name: "mcp-dp-lint",
        description: "Run BONE semantic lint on a file or directory.",
        arguments: [
            {
                name: "path",
                description: "Relative path to file or folder to lint.",
                required: true,
            },
        ],
        build: ({ path: targetPath }) => [
            `Run semantic lint for path: ${targetPath}`,
            "Call tool bone_semantic_lint with:",
            `{"path":"${targetPath}"}`,
            "If lint fails, report actionable fixes.",
        ].join("\n"),
    },
    {
        name: "mcp-dp-install-bookshelf",
        description: "Install one Bookshelf module and dependencies.",
        arguments: [
            {
                name: "module_name",
                description: "Bookshelf module name, for example math or random.",
                required: true,
            },
        ],
        build: ({ module_name }) => [
            `Install Bookshelf module: ${module_name}`,
            "Call tool fs_install_bookshelf_module with:",
            `{"module_name":"${module_name}"}`,
            "After install, recommend running mcp-dp-test with type=bookshelf_status.",
        ].join("\n"),
    },
    {
        name: "mcp-dp-install-bone",
        description: "Install BONE:MSD core dependency.",
        build: () => [
            "Install BONE:MSD core.",
            "Call tool fs_install_bone_msd with empty arguments.",
            "Return completion status.",
        ].join("\n"),
    },
    {
        name: "mcp-dp-deps",
        description: "Show installed dependency status.",
        build: () => [
            "Inspect installed libraries.",
            "Call tool fs_verify_dependencies with empty arguments.",
            "Present the returned JSON as a small status table.",
        ].join("\n"),
    },
    {
        name: "mcp-dp-mcdoc",
        description: "Inject BONE/Bookshelf MCDoc schemas.",
        build: () => [
            "Inject MCDoc schemas into .spyglass/mcdoc.",
            "Call tool inject_bone_mcdoc with empty arguments.",
            "Return outcome and next verification step.",
        ].join("\n"),
    },
    {
        name: "mcp-dp-assets-update",
        description: "Update ASSETS_TODO from JSON item list.",
        arguments: [
            {
                name: "items_json",
                description: "JSON array: [{\"name\":\"x\",\"type\":\"block|item\",\"namespace\":\"ns\"}]",
                required: true,
            },
        ],
        build: ({ items_json }) => [
            "Update ASSETS_TODO using the provided JSON array.",
            `Input JSON: ${items_json}`,
            "Parse JSON. If invalid JSON, return a clear parse error and do not call tools.",
            "If valid, call update_assets_todo with:",
            `{"items":<parsed-json-array>}`,
        ].join("\n"),
    },
    {
        name: "mcp-dp-assets-verify",
        description: "Verify assets referenced in ASSETS_TODO.",
        build: () => [
            "Verify asset files listed in ASSETS_TODO.",
            "Call tool fs_verify_assets with empty arguments.",
            "If missing assets exist, provide a concise missing list.",
        ].join("\n"),
    },
    {
        name: "mcp-dp-read",
        description: "Read file with project-state tracking.",
        arguments: [
            {
                name: "path",
                description: "Relative file path.",
                required: true,
            },
        ],
        build: ({ path: targetPath }) => [
            `Read file: ${targetPath}`,
            "Call tool fs_diff_read with:",
            `{"path":"${targetPath}"}`,
            "Return the file content without additional transformations.",
        ].join("\n"),
    },
    {
        name: "mcp-dp-write",
        description: "Write file from JSON payload with state tracking.",
        arguments: [
            {
                name: "payload_json",
                description: "JSON object: {\"path\":\"...\",\"content\":\"...\"}",
                required: true,
            },
        ],
        build: ({ payload_json }) => [
            "Write file from JSON payload.",
            `Payload: ${payload_json}`,
            "Parse payload JSON. If invalid JSON or missing path/content keys, return an explicit error and do not call tools.",
            "If valid, call fs_diff_write with the parsed object.",
        ].join("\n"),
    },
    {
        name: "mcp-dp-mods",
        description: "List manual modifications tracked by state manager.",
        build: () => [
            "Fetch manual modifications relative to tracked state.",
            "Call tool get_manual_modifications with empty arguments.",
            "Return concise structured summary.",
        ].join("\n"),
    },
    {
        name: "mcp-dp-test",
        description: "Run dynamic test (gametest or bookshelf_status).",
        arguments: [
            {
                name: "type",
                description: "One of: gametest, bookshelf_status.",
                required: false,
            },
        ],
        build: ({ type }) => {
            const resolvedType = type && type.length > 0 ? type : "gametest";
            return [
                `Run dynamic test with type: ${resolvedType}`,
                "Allowed values: gametest, bookshelf_status.",
                "If value is outside allowed set, return an explicit validation error and stop.",
                "If valid, call run_headless_test with:",
                `{"type":"${resolvedType}"}`,
            ].join("\n");
        },
    },
    {
        name: "mcp-dp-search",
        description: "Search local Minecraft/BONE docs index.",
        arguments: [
            {
                name: "query",
                description: "Free-text search query.",
                required: true,
            },
        ],
        build: ({ query }) => [
            `Search docs with query: ${query}`,
            "Call tool search_docs with:",
            `{"query":"${query}"}`,
            "Return top findings in concise bullets.",
        ].join("\n"),
    },
    {
        name: "mcp-dp-spyglass",
        description: "Run Spyglass syntax validation.",
        arguments: [
            {
                name: "path",
                description: "Relative path to validate.",
                required: true,
            },
        ],
        build: ({ path: targetPath }) => [
            `Run Spyglass validation on path: ${targetPath}`,
            "Call tool run_spyglass_cli with:",
            `{"path":"${targetPath}"}`,
            "Report pass/fail and detailed errors when present.",
        ].join("\n"),
    },
    {
        name: "mcp-dp-sync",
        description: "Synchronize whole project state snapshot.",
        build: () => [
            "Synchronize project file-state baseline.",
            "Call tool fs_sync_all with empty arguments.",
            "Return sync confirmation.",
        ].join("\n"),
    },
    {
        name: "mcp-dp-breaker-reset",
        description: "Reset lint circuit-breaker counters.",
        build: () => [
            "Reset circuit breaker attempts for all files.",
            "Call tool reset_circuit_breaker with empty arguments.",
            "Return reset confirmation.",
        ].join("\n"),
    },
    {
        name: "mcp-dp-doctor",
        description: "Run multi-check diagnostic report for project health.",
        build: () => [
            "Run diagnostic workflow.",
            "1) Call fs_verify_dependencies.",
            "2) Call get_manual_modifications.",
            "3) Call fs_verify_assets.",
            "4) Call fs_sync_all.",
            "Produce a final report with sections: Dependencies, Manual Modifications, Assets, Sync Status.",
        ].join("\n"),
    },
];
const server = new Server({ name: "datapack-tools", version: "0.1.0" }, { capabilities: { tools: {}, prompts: {} } });
const stateManager = new ProjectStateManager(rootDir);
const missionManager = new MissionStateManager(rootDir);
const bookshelfEngine = new BookshelfEngine(rootDir);
const boneEngine = new BONEEngine(rootDir);
const datapackInitEngine = new DatapackInitEngine(rootDir);
const contractValidator = new DatapackContractValidator(rootDir);
const capabilityCatalog = new CapabilityCatalogManager(rootDir);
const boneSemanticLinter = new BONESemanticLinter(rootDir);
const searchEngine = new DocSearchEngine(rootDir);
const spyglassRunner = new SpyglassRunner(rootDir);
const circuitBreaker = new CircuitBreaker();
// Initialisation immédiate du moteur de recherche RAG
searchEngine.init().catch(e => console.error("RAG Init Error:", e));
function inferCapabilitiesFromTask(task) {
    const t = task.toLowerCase();
    const caps = [];
    if (/(physique|projectile|collision|rebond|friction|raycast|mouvement)/.test(t)) {
        caps.push("physics", "entity-control");
    }
    if (/(interaction|clic|sneak|accroupi|trigger|joueur|event)/.test(t)) {
        caps.push("interaction");
    }
    if (/(worldgen|generation|biome|terrain|structure)/.test(t)) {
        caps.push("worldgen");
    }
    if (/(math|vector|calcul|equation)/.test(t)) {
        caps.push("math");
    }
    if (/(random|aleatoire|rng|chance)/.test(t)) {
        caps.push("random");
    }
    if (/(block|voxel|surface|state|nbt)/.test(t)) {
        caps.push("block-ops");
    }
    if (/(debug|profil|trace|log|diagnostic)/.test(t)) {
        caps.push("debug-observability", "performance");
    }
    return Array.from(new Set(caps));
}
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            { name: "bone_ingest_template", description: "Mise à jour RAG (BONE + Bookshelf).", inputSchema: { type: "object" } },
            { name: "bone_semantic_lint", description: "Linter Lois BONE + Sécurité @e.", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
            { name: "fs_install_bookshelf_module", description: "Installation physique module + dépendances.", inputSchema: { type: "object", properties: { module_name: { type: "string" } }, required: ["module_name"] } },
            { name: "fs_install_bone_msd", description: "Installation Core BONE:MSD.", inputSchema: { type: "object" } },
            { name: "fs_verify_dependencies", description: "Check libs installées.", inputSchema: { type: "object" } },
            { name: "inject_bone_mcdoc", description: "Injection schémas MCDoc.", inputSchema: { type: "object" } },
            { name: "update_assets_todo", description: "Gestion ASSETS_TODO.md.", inputSchema: { type: "object", properties: { items: { type: "array", items: { type: "object" } } }, required: ["items"] } },
            { name: "fs_verify_assets", description: "Vérification physique assets.", inputSchema: { type: "object" } },
            { name: "fs_diff_read", description: "Lecture fichier avec suivi d'état.", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
            { name: "fs_diff_write", description: "Écriture fichier avec suivi d'état.", inputSchema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } },
            { name: "get_manual_modifications", description: "Détection changements manuels.", inputSchema: { type: "object" } },
            { name: "search_docs", description: "Recherche RAG Minecraft.", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
            { name: "run_headless_test", description: "Validation bs.load:status ou Gametests.", inputSchema: { type: "object", properties: { type: { type: "string", enum: ["gametest", "bookshelf_status"] } } } },
            { name: "run_spyglass_cli", description: "Validation syntaxique stricte (Spyglass).", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
            {
                name: "fs_project_init",
                description: "Initialise un nouveau projet de datapack versionné (sans BONE/Bookshelf).",
                inputSchema: {
                    type: "object",
                    properties: {
                        version: { type: "string" },
                        namespace: { type: "string" },
                        profile: { type: "string", enum: ["minimal", "worldgen", "tests", "full"] }
                    },
                    required: ["version", "namespace"]
                }
            },
            {
                name: "fs_workspace_init",
                description: "[DEPRECATED] Alias de compatibilité vers fs_project_init.",
                inputSchema: {
                    type: "object",
                    properties: {
                        version: { type: "string" },
                        namespace: { type: "string" },
                        profile: { type: "string", enum: ["minimal", "worldgen", "tests", "full"] }
                    },
                    required: ["version", "namespace"]
                }
            },
            { name: "fs_sync_all", description: "Synchronisation complète de l'état du projet.", inputSchema: { type: "object" } },
            { name: "reset_circuit_breaker", description: "Reset global du disjoncteur.", inputSchema: { type: "object" } },
            {
                name: "agent_plan_create",
                description: "Crée un plan missionnel et active le gate GO humain.",
                inputSchema: {
                    type: "object",
                    properties: {
                        objective: { type: "string" },
                        assumptions: { type: "array", items: { type: "string" } },
                        decisions: { type: "array", items: { type: "string" } },
                        backlog: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    id: { type: "string" },
                                    title: { type: "string" },
                                    done: { type: "boolean" }
                                },
                                required: ["title"]
                            }
                        },
                        next_action: { type: "string" }
                    },
                    required: ["objective"]
                }
            },
            {
                name: "agent_plan_update",
                description: "Met à jour plan, backlog, statut, blockers, gates et next_action.",
                inputSchema: {
                    type: "object",
                    properties: {
                        objective: { type: "string" },
                        assumptions: { type: "array", items: { type: "string" } },
                        decisions: { type: "array", items: { type: "string" } },
                        backlog: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    id: { type: "string" },
                                    title: { type: "string" },
                                    done: { type: "boolean" }
                                },
                                required: ["id"]
                            }
                        },
                        blockers: { type: "array", items: { type: "string" } },
                        next_action: { type: "string" },
                        status: {
                            type: "string",
                            enum: ["draft", "research_blocked", "awaiting_go", "debate_in_progress", "in_progress", "waiting_human", "validation_blocked_headless", "blocked", "completed", "conditional_delivery"]
                        },
                        requires_human: { type: "boolean" },
                        gate: { type: "string", enum: ["planApproved", "assetsReady", "finalApproved"] },
                        gate_value: { type: "boolean" },
                        contract_passed: { type: "boolean" },
                        headless_required: { type: "boolean" },
                        headless_passed: { type: "boolean" },
                        runtime_impacting: { type: "boolean" }
                    }
                }
            },
            {
                name: "agent_phase_advance",
                description: "Fait avancer la phase d'orchestration de la mission.",
                inputSchema: {
                    type: "object",
                    properties: {
                        phase: {
                            type: "string",
                            enum: ["phase0_audit", "phase1_cadrage", "phase2_plan", "phase3_execution", "phase4_validation", "phase5_livraison"]
                        },
                        status: {
                            type: "string",
                            enum: ["draft", "research_blocked", "awaiting_go", "debate_in_progress", "in_progress", "waiting_human", "validation_blocked_headless", "blocked", "completed", "conditional_delivery"]
                        },
                        next_action: { type: "string" },
                        requires_human: { type: "boolean" }
                    },
                    required: ["phase"]
                }
            },
            {
                name: "agent_checkpoint_get",
                description: "Lit un checkpoint missionnel par clé.",
                inputSchema: {
                    type: "object",
                    properties: { key: { type: "string" } },
                    required: ["key"]
                }
            },
            {
                name: "agent_checkpoint_set",
                description: "Écrit un checkpoint missionnel par clé.",
                inputSchema: {
                    type: "object",
                    properties: {
                        key: { type: "string" },
                        value: { type: "string" }
                    },
                    required: ["key", "value"]
                }
            },
            {
                name: "agent_mission_read",
                description: "Lit la mémoire missionnelle (JSON + markdown).",
                inputSchema: { type: "object" }
            },
            {
                name: "agent_mission_write",
                description: "Met à jour la mémoire missionnelle de haut niveau.",
                inputSchema: {
                    type: "object",
                    properties: {
                        objective: { type: "string" },
                        assumptions: { type: "array", items: { type: "string" } },
                        decisions: { type: "array", items: { type: "string" } },
                        backlog: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    id: { type: "string" },
                                    title: { type: "string" },
                                    done: { type: "boolean" }
                                },
                                required: ["id"]
                            }
                        },
                        blockers: { type: "array", items: { type: "string" } },
                        next_action: { type: "string" },
                        status: {
                            type: "string",
                            enum: ["draft", "research_blocked", "awaiting_go", "debate_in_progress", "in_progress", "waiting_human", "validation_blocked_headless", "blocked", "completed", "conditional_delivery"]
                        },
                        requires_human: { type: "boolean" },
                        gate: { type: "string", enum: ["planApproved", "assetsReady", "finalApproved"] },
                        gate_value: { type: "boolean" },
                        contract_passed: { type: "boolean" },
                        headless_required: { type: "boolean" },
                        headless_passed: { type: "boolean" },
                        runtime_impacting: { type: "boolean" }
                    }
                }
            },
            {
                name: "agent_research_collect",
                description: "Collecte/synchronise le grounding research (sources, contraintes, evidence map, modules candidats).",
                inputSchema: {
                    type: "object",
                    properties: {
                        sources: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    id: { type: "string" },
                                    kind: { type: "string", enum: ["library_doc", "minecraft_runtime_doc", "internal_doc"] },
                                    title: { type: "string" },
                                    urlOrPath: { type: "string" },
                                    summary: { type: "string" }
                                },
                                required: ["id", "kind", "title", "urlOrPath", "summary"]
                            }
                        },
                        constraints: { type: "array", items: { type: "string" } },
                        chosen_modules: { type: "array", items: { type: "string" } },
                        rejected_modules: { type: "array", items: { type: "string" } },
                        use_case_class: { type: "string" },
                        evidence_map: {
                            type: "object",
                            additionalProperties: { type: "array", items: { type: "string" } }
                        },
                        module_candidates: { type: "array", items: { type: "string" } },
                        physics_model: { type: "string" }
                    }
                }
            },
            {
                name: "agent_research_validate",
                description: "Valide le gate research (>=3 sources avec les 3 types obligatoires).",
                inputSchema: {
                    type: "object",
                    properties: {
                        min_sources: { type: "number" }
                    }
                }
            },
            {
                name: "agent_plan_duel_start",
                description: "Demarre le duel contradictoire Planner vs Critic.",
                inputSchema: {
                    type: "object",
                    properties: {
                        planner: {
                            type: "object",
                            properties: {
                                proposal: { type: "string" },
                                risks: { type: "array", items: { type: "string" } },
                                score: { type: "number" }
                            },
                            required: ["proposal"]
                        },
                        critic: {
                            type: "object",
                            properties: {
                                proposal: { type: "string" },
                                risks: { type: "array", items: { type: "string" } },
                                score: { type: "number" }
                            },
                            required: ["proposal"]
                        }
                    },
                    required: ["planner", "critic"]
                }
            },
            {
                name: "agent_plan_duel_resolve",
                description: "Arbitre et journalise la decision du duel contradictoire.",
                inputSchema: {
                    type: "object",
                    properties: {
                        winner: { type: "string", enum: ["planner", "critic", "hybrid"] },
                        kept: { type: "array", items: { type: "string" } },
                        rejected: { type: "array", items: { type: "string" } },
                        tradeoffs: { type: "array", items: { type: "string" } },
                        risk_acceptance: { type: "string" },
                        rationale: { type: "string" }
                    },
                    required: ["winner", "rationale"]
                }
            },
            {
                name: "agent_library_route",
                description: "Routeur capability-first BONE/Bookshelf/Vanilla/Hybrid avec preuves et fallback.",
                inputSchema: {
                    type: "object",
                    properties: {
                        task: { type: "string" },
                        requested_capabilities: {
                            type: "array",
                            items: { type: "string", enum: [...CAPABILITIES] }
                        },
                        constraints: {
                            type: "object",
                            properties: {
                                version: { type: "string" },
                                performance: { type: "string", enum: ["low", "medium", "high"] },
                                no_external_lib: { type: "boolean" }
                            }
                        },
                        requires_custom_items_or_blocks: { type: "boolean" },
                        runtime_impacting: { type: "boolean" },
                        require_evidence: { type: "boolean" }
                    },
                    required: ["task"]
                }
            },
            {
                name: "agent_capability_catalog_refresh",
                description: "Recharge le catalogue capability->modules depuis le manifest Bookshelf et met le cache local a jour.",
                inputSchema: {
                    type: "object",
                    properties: {
                        force_remote: { type: "boolean" }
                    }
                }
            },
            {
                name: "agent_capability_catalog_get",
                description: "Retourne le catalogue capability-first ou un lookup cible par capability.",
                inputSchema: {
                    type: "object",
                    properties: {
                        capabilities: {
                            type: "array",
                            items: { type: "string", enum: [...CAPABILITIES] }
                        }
                    }
                }
            },
            {
                name: "datapack_contract_validate",
                description: "Valide le contrat runtime datapack (pack/tag/load/tick/advancements/refs).",
                inputSchema: {
                    type: "object",
                    properties: {
                        fail_on_warning: { type: "boolean" }
                    }
                }
            },
            {
                name: "datapack_physics_profile_apply",
                description: "Applique un profil physique surface->coefficients (friction/rebond/vitesse/gravite).",
                inputSchema: {
                    type: "object",
                    properties: {
                        namespace: { type: "string" },
                        profile_name: { type: "string" },
                        surfaces: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    block_tag_or_id: { type: "string" },
                                    restitution: { type: "number" },
                                    friction: { type: "number" },
                                    speed_factor: { type: "number" }
                                },
                                required: ["block_tag_or_id", "restitution", "friction"]
                            }
                        },
                        gravity_per_tick: { type: "number" }
                    },
                    required: ["namespace", "surfaces"]
                }
            },
            {
                name: "agent_loop_guard_check",
                description: "Detecte les boucles operationnelles (actions equivalentes repetees).",
                inputSchema: {
                    type: "object",
                    properties: {
                        signature: { type: "string" },
                        repeated_limit: { type: "number" }
                    },
                    required: ["signature"]
                }
            }
        ],
    };
});
server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return {
        prompts: promptRegistry.map((prompt) => ({
            name: prompt.name,
            description: prompt.description,
            arguments: prompt.arguments,
        })),
    };
});
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: promptArgs } = request.params;
    const prompt = promptRegistry.find((candidate) => candidate.name === name);
    if (!prompt) {
        throw new Error(`Prompt inconnu : ${name}`);
    }
    const args = (promptArgs ?? {});
    const missingRequired = (prompt.arguments ?? [])
        .filter((arg) => arg.required)
        .map((arg) => arg.name)
        .filter((key) => !args[key] || args[key].trim().length === 0);
    if (missingRequired.length > 0) {
        throw new Error(`Argument(s) manquant(s) pour ${name}: ${missingRequired.join(", ")}`);
    }
    return {
        description: prompt.description,
        messages: [
            {
                role: "user",
                content: {
                    type: "text",
                    text: prompt.build(args),
                },
            },
        ],
    };
});
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case "bone_ingest_template": {
                const boneRes = await boneEngine.ingestTemplate();
                const bsRes = await bookshelfEngine.ingest();
                // Ré-initialiser l'index de recherche après ingestion
                await searchEngine.init();
                return { content: [{ type: "text", text: `${boneRes}\n${bsRes}` }] };
            }
            case "bone_semantic_lint": {
                const key = `lint:${args?.path}`;
                if (circuitBreaker.isTriggered(key)) {
                    return { isError: true, content: [{ type: "text", text: `🛑 CIRCUIT BREAKER TRIGGERED: Trop d'échecs sur ce fichier (${circuitBreaker.getAttemptCount(key)} tentatives). Corrigez manuellement avant de réessayer.` }] };
                }
                const result = await boneSemanticLinter.lint(args?.path);
                if (result.status === "FAIL") {
                    circuitBreaker.recordAttempt(key);
                }
                else {
                    circuitBreaker.reset(key);
                }
                return { isError: result.status === "FAIL", content: [{ type: "text", text: result.errors.join("\n") || "PASS" }] };
            }
            case "fs_install_bookshelf_module": {
                const result = await bookshelfEngine.addDependency("bookshelf", [args?.module_name]);
                return { content: [{ type: "text", text: result }] };
            }
            case "fs_install_bone_msd": {
                const result = await bookshelfEngine.addDependency("bone_msd");
                return { content: [{ type: "text", text: result }] };
            }
            case "fs_verify_dependencies": {
                const dataPath = path.join(rootDir, "data");
                const entries = await fs.readdir(dataPath).catch(() => []);
                const libs = { bookshelf: entries.some(e => e.startsWith("bs.")), bone_msd: entries.includes("bone_msd") };
                return { content: [{ type: "text", text: JSON.stringify(libs) }] };
            }
            case "inject_bone_mcdoc": {
                await boneEngine.injectMCDoc();
                await bookshelfEngine.injectMCDoc();
                return { content: [{ type: "text", text: "Schémas MCDoc injectés dans .spyglass/mcdoc/" }] };
            }
            case "update_assets_todo": {
                await boneEngine.updateAssetsTodo(args?.items);
                return { content: [{ type: "text", text: "ASSETS_TODO.md mis à jour." }] };
            }
            case "fs_verify_assets": {
                const result = await boneEngine.verifyAssets();
                return { isError: result.missing.length > 0, content: [{ type: "text", text: result.missing.length > 0 ? `Manquant : ${result.missing.join(", ")}` : "OK" }] };
            }
            case "fs_diff_read": {
                const fullPath = path.resolve(rootDir, args?.path);
                const content = await fs.readFile(fullPath, "utf-8");
                await stateManager.updateFileState(args?.path, content);
                return { content: [{ type: "text", text: content }] };
            }
            case "fs_diff_write": {
                const fullPath = path.resolve(rootDir, args?.path);
                await fs.ensureDir(path.dirname(fullPath));
                await fs.writeFile(fullPath, args?.content, "utf-8");
                await stateManager.updateFileState(args?.path, args?.content);
                return { content: [{ type: "text", text: "Fichier écrit." }] };
            }
            case "get_manual_modifications": {
                const mods = await stateManager.getManualModifications();
                return { content: [{ type: "text", text: JSON.stringify(mods, null, 2) }] };
            }
            case "run_headless_test": {
                const type = args?.type || "gametest";
                const missionSnapshot = await missionManager.loadMission();
                const runtimeImpacting = missionSnapshot.taskClass.runtimeImpacting;
                const jarPath = path.join(rootDir, "headlessmc.jar");
                if (!(await fs.pathExists(jarPath))) {
                    const mission = await missionManager.updateMission({
                        status: runtimeImpacting ? "validation_blocked_headless" : "in_progress",
                        requiresHuman: runtimeImpacting,
                        nextAction: runtimeImpacting
                            ? "Ajouter headlessmc.jar a la racine puis relancer run_headless_test."
                            : "Headless absent mais tâche non runtime-impacting: continuer validation statique.",
                        headlessRequired: runtimeImpacting,
                        headlessPassed: false,
                    });
                    return {
                        isError: runtimeImpacting,
                        content: [{
                                type: "text",
                                text: "❌ Erreur : 'headlessmc.jar' est introuvable à la racine.\nAction requise : Téléchargez HeadlessMC (https://github.com/HeadlessMC/HeadlessMC) et placez-le dans le dossier du projet pour activer les tests dynamiques."
                            }],
                        structuredContent: {
                            mission,
                            headless_pass: false,
                        },
                    };
                }
                return new Promise((resolve) => {
                    let settled = false;
                    const cmd = type === "bookshelf_status" ? "function #bs.load:status" : "gametest runall";
                    const proc = spawn("java", ["-jar", jarPath, "--command", cmd], { cwd: rootDir });
                    const timeoutId = setTimeout(async () => {
                        if (settled)
                            return;
                        settled = true;
                        const mission = await missionManager.updateMission({
                            headlessRequired: runtimeImpacting,
                            headlessPassed: false,
                            status: runtimeImpacting ? "validation_blocked_headless" : "in_progress",
                            requiresHuman: runtimeImpacting,
                            nextAction: runtimeImpacting
                                ? "Verifier execution HeadlessMC puis relancer run_headless_test jusqu'au resultat final."
                                : "Timeout headless ignoré (non-runtime-impacting).",
                        });
                        resolve({
                            isError: runtimeImpacting,
                            content: [{ type: "text", text: "Exécution longue lancée sans confirmation de succès (timeout). Relancer pour résultat définitif." }],
                            structuredContent: { mission, headless_pass: false, timeout: true },
                        });
                    }, 60000);
                    proc.on("close", async () => {
                        if (settled)
                            return;
                        settled = true;
                        clearTimeout(timeoutId);
                        let headlessPass = true;
                        let text = "Test terminé.";
                        const logP = path.join(rootDir, "gametests/logs/latest.log");
                        if (type === "bookshelf_status" && await fs.pathExists(logP)) {
                            const log = await fs.readFile(logP, "utf-8");
                            const err = log.split("\n").filter(l => l.includes("[Bookshelf]") && l.includes("Error"));
                            if (err.length > 0) {
                                headlessPass = false;
                                text = err[0];
                            }
                        }
                        const mission = await missionManager.updateMission({
                            headlessRequired: runtimeImpacting,
                            headlessPassed: headlessPass,
                            status: headlessPass ? "in_progress" : runtimeImpacting ? "blocked" : "in_progress",
                        });
                        resolve({
                            isError: runtimeImpacting ? !headlessPass : false,
                            content: [{ type: "text", text }],
                            structuredContent: { mission, headless_pass: headlessPass },
                        });
                    });
                });
            }
            case "search_docs": {
                const res = searchEngine.search(args?.query);
                return { content: [{ type: "text", text: res.map(r => r.content).join("\n\n") }] };
            }
            case "run_spyglass_cli": {
                const result = await spyglassRunner.run(args?.path);
                return { isError: result.status !== "PASS", content: [{ type: "text", text: result.message + (result.errors.length > 0 ? "\n" + JSON.stringify(result.errors, null, 2) : "") }] };
            }
            case "fs_project_init": {
                const result = await datapackInitEngine.initProject({
                    version: args?.version,
                    namespace: args?.namespace,
                    profile: args?.profile,
                });
                await stateManager.syncAll();
                const summary = [
                    result.message,
                    `Version résolue: ${result.resolvedVersion.normalizedVersion}`,
                    `Pack format: ${result.resolvedVersion.packFormat}`,
                    `Profil: ${result.profile}`,
                    `Namespace: ${result.namespace}`,
                    `Fichiers/dossiers créés: ${result.createdPaths.length}`,
                    result.warnings.length > 0 ? `Warnings: ${result.warnings.join(" | ")}` : "Warnings: none",
                ].join("\n");
                return {
                    content: [{ type: "text", text: summary }],
                    structuredContent: result,
                };
            }
            case "fs_workspace_init": {
                const result = await datapackInitEngine.initProject({
                    version: args?.version,
                    namespace: args?.namespace,
                    profile: args?.profile,
                });
                await stateManager.syncAll();
                const summary = [
                    "[DEPRECATED] fs_workspace_init redirige vers fs_project_init.",
                    result.message,
                    `Version résolue: ${result.resolvedVersion.normalizedVersion}`,
                    `Pack format: ${result.resolvedVersion.packFormat}`,
                    `Profil: ${result.profile}`,
                    `Namespace: ${result.namespace}`,
                    `Fichiers/dossiers créés: ${result.createdPaths.length}`,
                    result.warnings.length > 0 ? `Warnings: ${result.warnings.join(" | ")}` : "Warnings: none",
                ].join("\n");
                return {
                    content: [{ type: "text", text: summary }],
                    structuredContent: {
                        deprecated: true,
                        replacement: "fs_project_init",
                        ...result,
                    },
                };
            }
            case "fs_sync_all": {
                await stateManager.syncAll();
                return { content: [{ type: "text", text: "État du projet synchronisé." }] };
            }
            case "reset_circuit_breaker": {
                circuitBreaker.resetAll();
                return { content: [{ type: "text", text: "Disjoncteur réinitialisé pour tous les fichiers." }] };
            }
            case "agent_plan_create": {
                const parsed = MissionPlanCreateSchema.parse(args ?? {});
                const mission = await missionManager.createOrReplacePlan({
                    objective: parsed.objective,
                    assumptions: parsed.assumptions,
                    decisions: parsed.decisions,
                    backlog: parsed.backlog,
                    nextAction: parsed.next_action,
                });
                return {
                    content: [{ type: "text", text: "Plan missionnel créé. Gate GO activé." }],
                    structuredContent: mission,
                };
            }
            case "agent_plan_update": {
                const parsed = MissionPlanUpdateSchema.parse(args ?? {});
                const before = await missionManager.loadMission();
                const targetHeadlessRequired = parsed.headless_required ?? before.validation.headlessRequired;
                const targetHeadlessPassed = parsed.headless_passed ?? before.validation.headlessPassed;
                const runtimeImpacting = parsed.runtime_impacting ?? before.taskClass.runtimeImpacting;
                if (parsed.status === "completed" && runtimeImpacting && targetHeadlessRequired && !targetHeadlessPassed) {
                    throw new Error("Cloture interdite: headless_pass doit etre true avant status=completed.");
                }
                let mission = await missionManager.updateMission({
                    objective: parsed.objective,
                    assumptions: parsed.assumptions,
                    decisions: parsed.decisions,
                    backlog: parsed.backlog,
                    blockers: parsed.blockers,
                    nextAction: parsed.next_action,
                    status: parsed.status,
                    requiresHuman: parsed.requires_human,
                    contractPassed: parsed.contract_passed,
                    headlessRequired: parsed.headless_required,
                    headlessPassed: parsed.headless_passed,
                    runtimeImpacting: parsed.runtime_impacting,
                });
                if (parsed.gate && parsed.gate_value !== undefined) {
                    mission = await missionManager.setGate(parsed.gate, parsed.gate_value);
                }
                return {
                    content: [{ type: "text", text: "Plan missionnel mis à jour." }],
                    structuredContent: mission,
                };
            }
            case "agent_phase_advance": {
                const parsed = PhaseAdvanceSchema.parse(args ?? {});
                const before = await missionManager.loadMission();
                if (parsed.status === "completed" &&
                    before.taskClass.runtimeImpacting &&
                    before.validation.headlessRequired &&
                    !before.validation.headlessPassed) {
                    throw new Error("Cloture interdite: headless_pass doit etre true avant status=completed.");
                }
                const mission = await missionManager.advancePhase({
                    phase: parsed.phase,
                    status: parsed.status,
                    nextAction: parsed.next_action,
                    requiresHuman: parsed.requires_human,
                });
                return {
                    content: [{ type: "text", text: `Phase avancée vers ${mission.phase}.` }],
                    structuredContent: mission,
                };
            }
            case "agent_checkpoint_get": {
                const parsed = CheckpointGetSchema.parse(args ?? {});
                const checkpoint = await missionManager.getCheckpoint(parsed.key);
                return {
                    content: [{ type: "text", text: checkpoint ? JSON.stringify(checkpoint, null, 2) : "Checkpoint introuvable." }],
                    structuredContent: { key: parsed.key, checkpoint },
                };
            }
            case "agent_checkpoint_set": {
                const parsed = CheckpointSetSchema.parse(args ?? {});
                const mission = await missionManager.setCheckpoint(parsed.key, parsed.value);
                return {
                    content: [{ type: "text", text: `Checkpoint '${parsed.key}' enregistré.` }],
                    structuredContent: mission,
                };
            }
            case "agent_mission_read": {
                const mission = await missionManager.loadMission();
                return {
                    content: [{ type: "text", text: JSON.stringify(mission, null, 2) }],
                    structuredContent: mission,
                };
            }
            case "agent_mission_write": {
                const parsed = MissionReadWriteSchema.parse(args ?? {});
                const before = await missionManager.loadMission();
                const targetHeadlessRequired = parsed.headless_required ?? before.validation.headlessRequired;
                const targetHeadlessPassed = parsed.headless_passed ?? before.validation.headlessPassed;
                const runtimeImpacting = parsed.runtime_impacting ?? before.taskClass.runtimeImpacting;
                if (parsed.status === "completed" && runtimeImpacting && targetHeadlessRequired && !targetHeadlessPassed) {
                    throw new Error("Cloture interdite: headless_pass doit etre true avant status=completed.");
                }
                let mission = await missionManager.updateMission({
                    objective: parsed.objective,
                    assumptions: parsed.assumptions,
                    decisions: parsed.decisions,
                    backlog: parsed.backlog,
                    blockers: parsed.blockers,
                    nextAction: parsed.next_action,
                    status: parsed.status,
                    requiresHuman: parsed.requires_human,
                    contractPassed: parsed.contract_passed,
                    headlessRequired: parsed.headless_required,
                    headlessPassed: parsed.headless_passed,
                    runtimeImpacting: parsed.runtime_impacting,
                });
                if (parsed.gate && parsed.gate_value !== undefined) {
                    mission = await missionManager.setGate(parsed.gate, parsed.gate_value);
                }
                return {
                    content: [{ type: "text", text: "Mémoire missionnelle mise à jour." }],
                    structuredContent: mission,
                };
            }
            case "agent_research_collect": {
                const parsed = ResearchCollectSchema.parse(args ?? {});
                const mission = await missionManager.updateResearch({
                    sources: parsed.sources,
                    constraints: parsed.constraints,
                    chosenModules: parsed.chosen_modules,
                    rejectedModules: parsed.rejected_modules,
                    useCaseClass: parsed.use_case_class,
                    evidenceMap: parsed.evidence_map,
                    moduleCandidates: parsed.module_candidates,
                    physicsModel: parsed.physics_model,
                    validated: false,
                });
                const updated = await missionManager.updateMission({
                    status: "research_blocked",
                    nextAction: "Valider le research gate (3 sources obligatoires) via agent_research_validate.",
                });
                return {
                    content: [{ type: "text", text: "Research collecté. Gate de validation requis." }],
                    structuredContent: { mission: updated, research: mission.research },
                };
            }
            case "agent_research_validate": {
                const parsed = ResearchValidateSchema.parse(args ?? {});
                const minSources = parsed.min_sources ?? 3;
                const mission = await missionManager.loadMission();
                const catalog = await capabilityCatalog.getCatalog();
                const byKind = new Set(mission.research.sources.map((s) => s.kind));
                const missingKinds = ["library_doc", "minecraft_runtime_doc", "internal_doc"].filter((k) => !byKind.has(k));
                const hasEnoughSources = mission.research.sources.length >= minSources;
                const evidenceCaps = Object.keys(mission.research.evidenceMap ?? {});
                const hasEvidence = evidenceCaps.length > 0 && evidenceCaps.every((cap) => {
                    const refs = mission.research.evidenceMap[cap] ?? [];
                    return refs.length > 0;
                });
                const selectedSet = new Set([
                    ...mission.research.chosenModules,
                    ...mission.research.moduleCandidates,
                ]);
                const incoherentCapabilities = evidenceCaps.filter((cap) => {
                    const knownModules = catalog.capabilityToModules[cap] ?? [];
                    if (knownModules.length === 0)
                        return false;
                    if (selectedSet.size === 0)
                        return true;
                    return !knownModules.some((mod) => selectedSet.has(mod));
                });
                const hasCapabilityCoherence = incoherentCapabilities.length === 0;
                const hasRejectedWithRationale = mission.research.rejectedModules.every((mod) => mission.research.constraints.some((c) => {
                    const v = c.toLowerCase();
                    return v.includes("reject") && v.includes(mod.toLowerCase());
                }));
                const hasModel = mission.research.physicsModel.trim().length > 0 || mission.research.useCaseClass !== "physics";
                const canValidate = hasEnoughSources &&
                    missingKinds.length === 0 &&
                    hasEvidence &&
                    hasCapabilityCoherence &&
                    hasRejectedWithRationale &&
                    hasModel;
                if (!canValidate) {
                    const blocked = await missionManager.updateMission({
                        status: "research_blocked",
                        requiresHuman: false,
                        nextAction: "Completer les sources/docs/evidence_map (et modeles necessaires) puis relancer agent_research_validate.",
                    });
                    return {
                        isError: true,
                        content: [{
                                type: "text",
                                text: `Research gate incomplet. sources=${mission.research.sources.length}/${minSources}; missingKinds=[${missingKinds.join(", ")}]; evidence=${hasEvidence ? "ok" : "missing"}; rejected_rationale=${hasRejectedWithRationale ? "ok" : "missing"}`,
                            }],
                        structuredContent: {
                            mission: blocked,
                            pass: false,
                            missing_kinds: missingKinds,
                            source_count: mission.research.sources.length,
                            min_sources: minSources,
                            evidence: hasEvidence,
                            capability_coherence: hasCapabilityCoherence,
                            incoherent_capabilities: incoherentCapabilities,
                            rejected_rationale: hasRejectedWithRationale,
                        },
                    };
                }
                const updated = await missionManager.updateResearch({ validated: true });
                const moved = await missionManager.updateMission({
                    status: "in_progress",
                    nextAction: "Demarrer le plan duel contradictoire (agent_plan_duel_start).",
                });
                return {
                    content: [{ type: "text", text: "Research gate valide." }],
                    structuredContent: { mission: moved, research: updated.research, pass: true },
                };
            }
            case "agent_plan_duel_start": {
                const parsed = PlanDuelStartSchema.parse(args ?? {});
                await missionManager.setDebatePosition({
                    agent: "planner",
                    proposal: parsed.planner.proposal,
                    risks: parsed.planner.risks,
                    score: parsed.planner.score,
                });
                const mission = await missionManager.setDebatePosition({
                    agent: "critic",
                    proposal: parsed.critic.proposal,
                    risks: parsed.critic.risks,
                    score: parsed.critic.score,
                });
                return {
                    content: [{ type: "text", text: "Duel Planner vs Critic lance." }],
                    structuredContent: mission,
                };
            }
            case "agent_plan_duel_resolve": {
                const parsed = PlanDuelResolveSchema.parse(args ?? {});
                const mission = await missionManager.resolveDebate({
                    winner: parsed.winner,
                    kept: parsed.kept,
                    rejected: parsed.rejected,
                    tradeoffs: parsed.tradeoffs,
                    riskAcceptance: parsed.risk_acceptance,
                    rationale: parsed.rationale,
                });
                return {
                    content: [{ type: "text", text: "Duel arbitre et decision loggee." }],
                    structuredContent: mission,
                };
            }
            case "agent_library_route": {
                const parsed = LibraryRouteSchema.parse(args ?? {});
                const requestedCapabilities = parsed.requested_capabilities && parsed.requested_capabilities.length > 0
                    ? parsed.requested_capabilities
                    : inferCapabilitiesFromTask(parsed.task);
                const constraints = parsed.constraints ?? {};
                const runtimeImpacting = parsed.runtime_impacting ?? true;
                const requireEvidence = parsed.require_evidence ?? true;
                const lookup = await capabilityCatalog.lookupByCapabilities(requestedCapabilities);
                const mission = await missionManager.updateMission({
                    runtimeImpacting,
                });
                const hasSpecializedModules = requestedCapabilities.some((cap) => (lookup.capabilityMatches[cap] ?? []).length > 0);
                const noExternal = constraints.no_external_lib === true;
                const evidenceMap = mission.research.evidenceMap ?? {};
                const missingEvidence = requestedCapabilities.filter((cap) => {
                    const refs = evidenceMap[cap] ?? [];
                    return refs.length === 0 && (lookup.capabilityMatches[cap] ?? []).length > 0;
                });
                if (requireEvidence && missingEvidence.length > 0) {
                    const blocked = await missionManager.updateMission({
                        status: "research_blocked",
                        nextAction: "Fournir des preuves par capability (evidence_map) avant routage final.",
                    });
                    return {
                        isError: true,
                        content: [{ type: "text", text: `Route refusée: preuves manquantes pour [${missingEvidence.join(", ")}].` }],
                        structuredContent: {
                            mission: blocked,
                            refused: true,
                            missing_evidence: missingEvidence,
                            requested_capabilities: requestedCapabilities,
                        },
                    };
                }
                let route = "vanilla";
                const selectedModules = lookup.recommendedModules.slice(0, 8);
                const rejectedModules = [];
                let confidence = 0.6;
                let rationale = "Route vanilla retenue pour besoin simple.";
                let fallbackRoute = "vanilla";
                if (parsed.requires_custom_items_or_blocks && hasSpecializedModules && !noExternal) {
                    route = "hybrid";
                    confidence = 0.85;
                    rationale = "Besoins items/blocks custom + capabilities spécialisées: route hybride BONE + Bookshelf.";
                    fallbackRoute = "bone";
                }
                else if (parsed.requires_custom_items_or_blocks && !hasSpecializedModules) {
                    route = "bone";
                    confidence = 0.82;
                    rationale = "Besoins items/blocks custom sans capability Bookshelf critique.";
                    fallbackRoute = "vanilla";
                }
                else if (hasSpecializedModules && !noExternal) {
                    route = "bookshelf";
                    confidence = 0.84;
                    rationale = "Capabilities demandées couvertes par modules Bookshelf spécialisés.";
                    fallbackRoute = "vanilla";
                }
                else if (noExternal && hasSpecializedModules) {
                    route = "vanilla";
                    confidence = 0.45;
                    rationale = "Contrainte no_external_lib active: fallback vanilla malgré couverture spécialisée disponible.";
                    rejectedModules.push(...selectedModules);
                    fallbackRoute = "bookshelf";
                }
                for (const cap of requestedCapabilities) {
                    await missionManager.setCapabilityEvidence(cap, {
                        sources: evidenceMap[cap] ?? [],
                        selectedModules,
                        rejectedModules,
                    });
                }
                return {
                    content: [{ type: "text", text: `Route: ${route}. ${rationale}` }],
                    structuredContent: {
                        route,
                        selected_modules: selectedModules,
                        rejected_modules: Array.from(new Set(rejectedModules)),
                        confidence,
                        rationale,
                        fallback_route: fallbackRoute,
                        requested_capabilities: requestedCapabilities,
                        runtime_impacting: runtimeImpacting,
                        constraints,
                        catalog_version: lookup.catalogVersion,
                    },
                };
            }
            case "agent_capability_catalog_refresh": {
                const parsed = CapabilityCatalogRefreshSchema.parse(args ?? {});
                const catalog = parsed.force_remote === false
                    ? await capabilityCatalog.getCatalog()
                    : await capabilityCatalog.refreshFromRemoteManifest();
                return {
                    content: [{ type: "text", text: `Catalogue capability mis à jour (${catalog.modules.length} modules).` }],
                    structuredContent: catalog,
                };
            }
            case "agent_capability_catalog_get": {
                const parsed = CapabilityCatalogGetSchema.parse(args ?? {});
                if (!parsed.capabilities || parsed.capabilities.length === 0) {
                    const catalog = await capabilityCatalog.getCatalog();
                    return {
                        content: [{ type: "text", text: "Catalogue capability chargé." }],
                        structuredContent: catalog,
                    };
                }
                const lookup = await capabilityCatalog.lookupByCapabilities(parsed.capabilities);
                return {
                    content: [{ type: "text", text: `Lookup capabilities: ${parsed.capabilities.join(", ")}` }],
                    structuredContent: lookup,
                };
            }
            case "datapack_contract_validate": {
                const parsed = ContractValidateSchema.parse(args ?? {});
                const result = await contractValidator.validate();
                const pass = parsed.fail_on_warning ? result.pass && result.warnings.length === 0 : result.pass;
                const missionBefore = await missionManager.loadMission();
                const mission = await missionManager.updateMission({
                    contractPassed: pass,
                    status: pass ? "in_progress" : "blocked",
                    nextAction: pass
                        ? missionBefore.taskClass.runtimeImpacting
                            ? "Contrat datapack valide. Continuer vers validation headless."
                            : "Contrat datapack valide. Continuer vers clôture (headless non requis)."
                        : "Corriger les erreurs de contrat datapack puis relancer datapack_contract_validate.",
                });
                return {
                    isError: !pass,
                    content: [{
                            type: "text",
                            text: pass
                                ? "Contrat datapack valide."
                                : `Contrat datapack invalide.\n${result.errors.join("\n")}`,
                        }],
                    structuredContent: {
                        mission,
                        ...result,
                        pass,
                    },
                };
            }
            case "datapack_physics_profile_apply": {
                const parsed = PhysicsProfileApplySchema.parse(args ?? {});
                const outPath = path.join(rootDir, "data", parsed.namespace, "physics", `${parsed.profile_name}.json`);
                await fs.ensureDir(path.dirname(outPath));
                const profile = {
                    profile_name: parsed.profile_name,
                    gravity_per_tick: parsed.gravity_per_tick,
                    surfaces: parsed.surfaces,
                    notes: "Profil simplifie Minecraft-compatible: vitesse discrete, gravite constante, restitution/friction par surface.",
                };
                await fs.writeJson(outPath, profile, { spaces: 2 });
                const relPath = path.relative(rootDir, outPath);
                const mission = await missionManager.setCheckpoint("physics_profile", `Applied ${parsed.profile_name} -> ${relPath}`);
                return {
                    content: [{ type: "text", text: `Profil physique appliqué: ${relPath}` }],
                    structuredContent: { mission, path: relPath, profile },
                };
            }
            case "agent_loop_guard_check": {
                const parsed = LoopGuardCheckSchema.parse(args ?? {});
                const normalizedSignature = parsed.signature
                    .replace(/\s+/g, " ")
                    .replace(/0x[a-f0-9]+/gi, "0x*")
                    .replace(/\d+/g, "#")
                    .trim()
                    .toLowerCase();
                const mission = await missionManager.registerLoopSignature(normalizedSignature);
                const overRepeat = mission.loopGuard.repeatedSignatureCount >= parsed.repeated_limit;
                const overBudget = mission.loopGuard.currentSteps >= mission.loopGuard.maxSteps;
                if (overRepeat || overBudget) {
                    const blocked = await missionManager.updateMission({
                        status: "blocked",
                        requiresHuman: true,
                        nextAction: "Loop guard declenche: diagnostic root-cause puis replanification ciblee obligatoire.",
                        blockers: [
                            overRepeat
                                ? `Action repetee trop souvent (signature='${normalizedSignature}').`
                                : "Step budget depasse.",
                        ],
                    });
                    return {
                        isError: true,
                        content: [{ type: "text", text: "Loop guard déclenché. Replanification forcée." }],
                        structuredContent: {
                            mission: blocked,
                            overRepeat,
                            overBudget,
                            normalized_signature: normalizedSignature,
                            diagnostic: {
                                root_cause: overRepeat ? "repetition_equivalente" : "step_budget_exceeded",
                                action: "forbid_identical_retry_without_new_hypothesis",
                            },
                        },
                    };
                }
                return {
                    content: [{ type: "text", text: "Loop guard OK." }],
                    structuredContent: { mission, overRepeat: false, overBudget: false, normalized_signature: normalizedSignature },
                };
            }
            default: throw new Error(`Outil inconnu : ${name}`);
        }
    }
    catch (error) {
        return { isError: true, content: [{ type: "text", text: error.message }] };
    }
});
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch(e => { console.error(e); process.exit(1); });
