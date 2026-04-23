import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, GetPromptRequestSchema, ListPromptsRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { BONESemanticLinter } from "./BONESemanticLinter.js";
import { BookshelfEngine } from "./BookshelfEngine.js";
import { BONEEngine } from "./BONEEngine.js";
import { ProjectStateManager } from "./ProjectStateManager.js";
import { DocSearchEngine } from "./DocSearchEngine.js";
import { SpyglassRunner } from "./SpyglassRunner.js";
import { CircuitBreaker } from "./CircuitBreaker.js";
import { spawn } from "child_process";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = process.env.MCP_PROJECT_ROOT || process.cwd();
const promptRegistry = [
    {
        name: "mcp-dp-init",
        description: "Initialize a datapack workspace from BONE:MSD template.",
        arguments: [
            {
                name: "version",
                description: "Minecraft version hint (informational for project context).",
                required: true,
            },
        ],
        build: ({ version }) => [
            "Initialize the datapack workspace.",
            `Requested target version: ${version}`,
            "Call tool fs_workspace_init with:",
            `{"version":"${version}"}`,
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
const bookshelfEngine = new BookshelfEngine(rootDir);
const boneEngine = new BONEEngine(rootDir);
const boneSemanticLinter = new BONESemanticLinter(rootDir);
const searchEngine = new DocSearchEngine(rootDir);
const spyglassRunner = new SpyglassRunner(rootDir);
const circuitBreaker = new CircuitBreaker();
// Initialisation immédiate du moteur de recherche RAG
searchEngine.init().catch(e => console.error("RAG Init Error:", e));
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
            { name: "fs_workspace_init", description: "Initialise un nouveau projet de datapack avec le template BONE:MSD.", inputSchema: { type: "object", properties: { version: { type: "string" } }, required: ["version"] } },
            { name: "fs_sync_all", description: "Synchronisation complète de l'état du projet.", inputSchema: { type: "object" } },
            { name: "reset_circuit_breaker", description: "Reset global du disjoncteur.", inputSchema: { type: "object" } }
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
                const jarPath = path.join(rootDir, "headlessmc.jar");
                if (!(await fs.pathExists(jarPath))) {
                    return {
                        isError: true,
                        content: [{
                                type: "text",
                                text: "❌ Erreur : 'headlessmc.jar' est introuvable à la racine.\nAction requise : Téléchargez HeadlessMC (https://github.com/HeadlessMC/HeadlessMC) et placez-le dans le dossier du projet pour activer les tests dynamiques."
                            }]
                    };
                }
                return new Promise((resolve) => {
                    const cmd = type === "bookshelf_status" ? "function #bs.load:status" : "gametest runall";
                    const proc = spawn("java", ["-jar", jarPath, "--command", cmd], { cwd: rootDir });
                    proc.on("close", async () => {
                        const logP = path.join(rootDir, "gametests/logs/latest.log");
                        if (type === "bookshelf_status" && await fs.pathExists(logP)) {
                            const log = await fs.readFile(logP, "utf-8");
                            const err = log.split("\n").filter(l => l.includes("[Bookshelf]") && l.includes("Error"));
                            if (err.length > 0)
                                return resolve({ isError: true, content: [{ type: "text", text: err[0] }] });
                        }
                        resolve({ content: [{ type: "text", text: "Test terminé." }] });
                    });
                    setTimeout(() => resolve({ content: [{ type: "text", text: "Exécution longue lancée." }] }), 60000);
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
            case "fs_workspace_init": {
                const initRes = await boneEngine.initTemplate();
                await stateManager.syncAll();
                return { content: [{ type: "text", text: initRes }] };
            }
            case "fs_sync_all": {
                await stateManager.syncAll();
                return { content: [{ type: "text", text: "État du projet synchronisé." }] };
            }
            case "reset_circuit_breaker": {
                circuitBreaker.resetAll();
                return { content: [{ type: "text", text: "Disjoncteur réinitialisé pour tous les fichiers." }] };
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
