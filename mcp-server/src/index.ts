import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { BONESemanticLinter } from "./BONESemanticLinter.js";
import { BookshelfEngine } from "./BookshelfEngine.js";
import { BONEEngine } from "./BONEEngine.js";
import { DatapackInitEngine, type InitProfile } from "./DatapackInitEngine.js";
import { ProjectStateManager } from "./ProjectStateManager.js";
import { MissionStateManager } from "./MissionStateManager.js";
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
  "awaiting_go",
  "in_progress",
  "waiting_human",
  "blocked",
  "completed",
  "conditional_delivery",
]);

const MissionPlanCreateSchema = z.object({
  objective: z.string().min(1),
  assumptions: z.array(z.string()).optional(),
  decisions: z.array(z.string()).optional(),
  backlog: z
    .array(
      z.object({
        id: z.string().optional(),
        title: z.string().min(1),
        done: z.boolean().optional(),
      })
    )
    .optional(),
  next_action: z.string().optional(),
});

const MissionPlanUpdateSchema = z.object({
  objective: z.string().optional(),
  assumptions: z.array(z.string()).optional(),
  decisions: z.array(z.string()).optional(),
  backlog: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        done: z.boolean().optional(),
      })
    )
    .optional(),
  blockers: z.array(z.string()).optional(),
  next_action: z.string().optional(),
  status: MissionStatusSchema.optional(),
  requires_human: z.boolean().optional(),
  gate: z.enum(["planApproved", "assetsReady", "finalApproved"]).optional(),
  gate_value: z.boolean().optional(),
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
    .array(
      z.object({
        id: z.string(),
        title: z.string().optional(),
        done: z.boolean().optional(),
      })
    )
    .optional(),
  blockers: z.array(z.string()).optional(),
  next_action: z.string().optional(),
  status: MissionStatusSchema.optional(),
  requires_human: z.boolean().optional(),
  gate: z.enum(["planApproved", "assetsReady", "finalApproved"]).optional(),
  gate_value: z.boolean().optional(),
});

type PromptArg = {
  name: string;
  description: string;
  required?: boolean;
};

type PromptDef = {
  name: string;
  description: string;
  arguments?: PromptArg[];
  build: (args: Record<string, string>) => string;
};

const promptRegistry: PromptDef[] = [
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
    build: ({ version, namespace, profile }) =>
      [
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
    build: () =>
      [
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
    build: ({ path: targetPath }) =>
      [
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
    build: ({ module_name }) =>
      [
        `Install Bookshelf module: ${module_name}`,
        "Call tool fs_install_bookshelf_module with:",
        `{"module_name":"${module_name}"}`,
        "After install, recommend running mcp-dp-test with type=bookshelf_status.",
      ].join("\n"),
  },
  {
    name: "mcp-dp-install-bone",
    description: "Install BONE:MSD core dependency.",
    build: () =>
      [
        "Install BONE:MSD core.",
        "Call tool fs_install_bone_msd with empty arguments.",
        "Return completion status.",
      ].join("\n"),
  },
  {
    name: "mcp-dp-deps",
    description: "Show installed dependency status.",
    build: () =>
      [
        "Inspect installed libraries.",
        "Call tool fs_verify_dependencies with empty arguments.",
        "Present the returned JSON as a small status table.",
      ].join("\n"),
  },
  {
    name: "mcp-dp-mcdoc",
    description: "Inject BONE/Bookshelf MCDoc schemas.",
    build: () =>
      [
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
    build: ({ items_json }) =>
      [
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
    build: () =>
      [
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
    build: ({ path: targetPath }) =>
      [
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
    build: ({ payload_json }) =>
      [
        "Write file from JSON payload.",
        `Payload: ${payload_json}`,
        "Parse payload JSON. If invalid JSON or missing path/content keys, return an explicit error and do not call tools.",
        "If valid, call fs_diff_write with the parsed object.",
      ].join("\n"),
  },
  {
    name: "mcp-dp-mods",
    description: "List manual modifications tracked by state manager.",
    build: () =>
      [
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
    build: ({ query }) =>
      [
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
    build: ({ path: targetPath }) =>
      [
        `Run Spyglass validation on path: ${targetPath}`,
        "Call tool run_spyglass_cli with:",
        `{"path":"${targetPath}"}`,
        "Report pass/fail and detailed errors when present.",
      ].join("\n"),
  },
  {
    name: "mcp-dp-sync",
    description: "Synchronize whole project state snapshot.",
    build: () =>
      [
        "Synchronize project file-state baseline.",
        "Call tool fs_sync_all with empty arguments.",
        "Return sync confirmation.",
      ].join("\n"),
  },
  {
    name: "mcp-dp-breaker-reset",
    description: "Reset lint circuit-breaker counters.",
    build: () =>
      [
        "Reset circuit breaker attempts for all files.",
        "Call tool reset_circuit_breaker with empty arguments.",
        "Return reset confirmation.",
      ].join("\n"),
  },
  {
    name: "mcp-dp-doctor",
    description: "Run multi-check diagnostic report for project health.",
    build: () =>
      [
        "Run diagnostic workflow.",
        "1) Call fs_verify_dependencies.",
        "2) Call get_manual_modifications.",
        "3) Call fs_verify_assets.",
        "4) Call fs_sync_all.",
        "Produce a final report with sections: Dependencies, Manual Modifications, Assets, Sync Status.",
      ].join("\n"),
  },
];

const server = new Server(
  { name: "datapack-tools", version: "0.1.0" },
  { capabilities: { tools: {}, prompts: {} } }
);

const stateManager = new ProjectStateManager(rootDir);
const missionManager = new MissionStateManager(rootDir);
const bookshelfEngine = new BookshelfEngine(rootDir);
const boneEngine = new BONEEngine(rootDir);
const datapackInitEngine = new DatapackInitEngine(rootDir);
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
              enum: ["draft", "awaiting_go", "in_progress", "waiting_human", "blocked", "completed", "conditional_delivery"]
            },
            requires_human: { type: "boolean" },
            gate: { type: "string", enum: ["planApproved", "assetsReady", "finalApproved"] },
            gate_value: { type: "boolean" }
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
              enum: ["draft", "awaiting_go", "in_progress", "waiting_human", "blocked", "completed", "conditional_delivery"]
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
              enum: ["draft", "awaiting_go", "in_progress", "waiting_human", "blocked", "completed", "conditional_delivery"]
            },
            requires_human: { type: "boolean" },
            gate: { type: "string", enum: ["planApproved", "assetsReady", "finalApproved"] },
            gate_value: { type: "boolean" }
          }
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

  const args = (promptArgs ?? {}) as Record<string, string>;
  const missingRequired = (prompt.arguments ?? [])
    .filter((arg) => arg.required)
    .map((arg) => arg.name)
    .filter((key) => !args[key] || args[key].trim().length === 0);

  if (missingRequired.length > 0) {
    throw new Error(
      `Argument(s) manquant(s) pour ${name}: ${missingRequired.join(", ")}`
    );
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
        const result = await boneSemanticLinter.lint(args?.path as string);
        if (result.status === "FAIL") {
            circuitBreaker.recordAttempt(key);
        } else {
            circuitBreaker.reset(key);
        }
        return { isError: result.status === "FAIL", content: [{ type: "text", text: result.errors.join("\n") || "PASS" }] };
      }
      case "fs_install_bookshelf_module": {
        const result = await bookshelfEngine.addDependency("bookshelf", [args?.module_name as string]);
        return { content: [{ type: "text", text: result }] };
      }
      case "fs_install_bone_msd": {
        const result = await bookshelfEngine.addDependency("bone_msd");
        return { content: [{ type: "text", text: result }] };
      }
      case "fs_verify_dependencies": {
        const dataPath = path.join(rootDir, "data");
        const entries: string[] = await fs.readdir(dataPath).catch(() => []);
        const libs = { bookshelf: entries.some(e => e.startsWith("bs.")), bone_msd: entries.includes("bone_msd") };
        return { content: [{ type: "text", text: JSON.stringify(libs) }] };
      }
      case "inject_bone_mcdoc": {
        await boneEngine.injectMCDoc();
        await bookshelfEngine.injectMCDoc();
        return { content: [{ type: "text", text: "Schémas MCDoc injectés dans .spyglass/mcdoc/" }] };
      }
      case "update_assets_todo": {
        await boneEngine.updateAssetsTodo(args?.items as any);
        return { content: [{ type: "text", text: "ASSETS_TODO.md mis à jour." }] };
      }
      case "fs_verify_assets": {
        const result = await boneEngine.verifyAssets();
        return { isError: result.missing.length > 0, content: [{ type: "text", text: result.missing.length > 0 ? `Manquant : ${result.missing.join(", ")}` : "OK" }] };
      }
      case "fs_diff_read": {
        const fullPath = path.resolve(rootDir, args?.path as string);
        const content = await fs.readFile(fullPath, "utf-8");
        await stateManager.updateFileState(args?.path as string, content);
        return { content: [{ type: "text", text: content }] };
      }
      case "fs_diff_write": {
        const fullPath = path.resolve(rootDir, args?.path as string);
        await fs.ensureDir(path.dirname(fullPath));
        await fs.writeFile(fullPath, args?.content as string, "utf-8");
        await stateManager.updateFileState(args?.path as string, args?.content as string);
        return { content: [{ type: "text", text: "Fichier écrit." }] };
      }
      case "get_manual_modifications": {
        const mods = await stateManager.getManualModifications();
        return { content: [{ type: "text", text: JSON.stringify(mods, null, 2) }] };
      }
      case "run_headless_test": {
        const type = args?.type as string || "gametest";
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
                    if (err.length > 0) return resolve({ isError: true, content: [{ type: "text", text: err[0] }] });
                }
                resolve({ content: [{ type: "text", text: "Test terminé." }] });
            });
            setTimeout(() => resolve({ content: [{ type: "text", text: "Exécution longue lancée." }] }), 60000);
        });
      }
      case "search_docs": {
        const res = searchEngine.search(args?.query as string);
        return { content: [{ type: "text", text: res.map(r => r.content).join("\n\n") }] };
      }
      case "run_spyglass_cli": {
        const result = await spyglassRunner.run(args?.path as string);
        return { isError: result.status !== "PASS", content: [{ type: "text", text: result.message + (result.errors.length > 0 ? "\n" + JSON.stringify(result.errors, null, 2) : "") }] };
      }
      case "fs_project_init": {
        const result = await datapackInitEngine.initProject({
          version: args?.version as string,
          namespace: args?.namespace as string,
          profile: args?.profile as InitProfile | undefined,
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
          version: args?.version as string,
          namespace: args?.namespace as string,
          profile: args?.profile as InitProfile | undefined,
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
        let mission = await missionManager.updateMission({
          objective: parsed.objective,
          assumptions: parsed.assumptions,
          decisions: parsed.decisions,
          backlog: parsed.backlog,
          blockers: parsed.blockers,
          nextAction: parsed.next_action,
          status: parsed.status,
          requiresHuman: parsed.requires_human,
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
        let mission = await missionManager.updateMission({
          objective: parsed.objective,
          assumptions: parsed.assumptions,
          decisions: parsed.decisions,
          backlog: parsed.backlog,
          blockers: parsed.blockers,
          nextAction: parsed.next_action,
          status: parsed.status,
          requiresHuman: parsed.requires_human,
        });
        if (parsed.gate && parsed.gate_value !== undefined) {
          mission = await missionManager.setGate(parsed.gate, parsed.gate_value);
        }
        return {
          content: [{ type: "text", text: "Mémoire missionnelle mise à jour." }],
          structuredContent: mission,
        };
      }
      default: throw new Error(`Outil inconnu : ${name}`);
    }
  } catch (error: any) { return { isError: true, content: [{ type: "text", text: error.message }] }; }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
main().catch(e => { console.error(e); process.exit(1); });
