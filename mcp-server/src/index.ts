import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
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

const server = new Server(
  { name: "datapack-tools", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

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
      { name: "fs_sync_all", description: "Synchronisation complète de l'état du projet.", inputSchema: { type: "object" } },
      { name: "reset_circuit_breaker", description: "Reset global du disjoncteur.", inputSchema: { type: "object" } }
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
  } catch (error: any) { return { isError: true, content: [{ type: "text", text: error.message }] }; }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
main().catch(e => { console.error(e); process.exit(1); });
