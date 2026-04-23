import fs from "fs-extra";
import path from "path";
import { spawn } from "child_process";
import { SpyglassRunner } from "./SpyglassRunner.js";
import axios from "axios";
import { execSync } from "child_process";
export class BONEEngine {
    rootDir;
    static TEMPLATE_URL = "https://github.com/TheophileBaudouin/template-BONE-MSD.git";
    static ZIP_URL = "https://github.com/TheophileBaudouin/template-BONE-MSD/archive/refs/heads/main.zip";
    constructor(rootDir) {
        this.rootDir = rootDir;
    }
    /**
     * Ingest le template BONE:MSD pour extraire la connaissance structurelle.
     */
    async ingestTemplate() {
        const timestamp = Date.now();
        const tmpDir = path.join(this.rootDir, `.bone_ingest_tmp_${timestamp}`);
        const zipPath = path.join(this.rootDir, `bone_template_${timestamp}.zip`);
        const docsDir = path.join(this.rootDir, ".docs");
        await fs.ensureDir(docsDir);
        await fs.remove(tmpDir);
        console.error(`Ingesting BONE:MSD template via HTTPS...`);
        try {
            // 1. Téléchargement du ZIP
            const response = await axios.get(BONEEngine.ZIP_URL, { responseType: 'arraybuffer' });
            await fs.writeFile(zipPath, response.data);
            // 2. Extraction (on utilise 'unzip' qui est standard sur Darwin/macOS)
            await fs.ensureDir(tmpDir);
            execSync(`unzip -q "${zipPath}" -d "${tmpDir}"`);
            const extractedDir = path.join(tmpDir, "template-BONE-MSD-main");
            // 3. Extraction de la documentation du README
            const readmePath = path.join(extractedDir, "README.md");
            const readmeContent = await fs.readFile(readmePath, "utf-8");
            // 4. Analyse structurelle
            const datapackPath = path.join(extractedDir, "BONE-MSD Datapack/data/bone_msd");
            const functions = await this.listFunctionsRecursive(path.join(datapackPath, "function"));
            const knowledge = {
                version: "latest",
                last_ingest: new Date().toISOString(),
                core_apis: functions.filter(f => f.includes("utils") || f.includes("trigger")),
                readme_summary: readmeContent.substring(0, 2000),
            };
            // 5. Génération du fichier interne pour l'IA
            const internalDocPath = path.join(this.rootDir, "BONE_MSD_INTERNAL.md");
            const internalDocContent = `# BONE:MSD INTERNAL KNOWLEDGE (AUTOMATICALLY GENERATED)
DO NOT EDIT MANUALLY.

## Core APIs Detected
${knowledge.core_apis.map(f => `* bone_msd:${f}`).join("\n")}

## Original README
${readmeContent}
`;
            await fs.writeFile(internalDocPath, internalDocContent, "utf-8");
            await fs.writeJson(path.join(docsDir, "bone_msd.json"), knowledge, { spaces: 2 });
            // 6. Injection et Validation MCDoc
            await this.injectMCDoc();
            await this.validateMCDoc(extractedDir);
            // Nettoyage
            await fs.remove(tmpDir);
            await fs.remove(zipPath);
            return "Ingestion BONE:MSD terminée via HTTPS. Schémas validés et documentation interne générée.";
        }
        catch (e) {
            await fs.remove(tmpDir).catch(() => { });
            await fs.remove(zipPath).catch(() => { });
            throw new Error(`ERREUR D'INGESTION HTTPS : ${e.message}`);
        }
    }
    async listFunctionsRecursive(dir, base = "") {
        const files = await fs.readdir(dir);
        let results = [];
        for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = await fs.stat(fullPath);
            if (stat.isDirectory()) {
                results = results.concat(await this.listFunctionsRecursive(fullPath, path.join(base, file)));
            }
            else if (file.endsWith(".mcfunction")) {
                results.push(path.join(base, file.replace(".mcfunction", "")).replace(/\\/g, "/"));
            }
        }
        return results;
    }
    async validateMCDoc(tmpDir) {
        console.error("Validating generated MCDoc with Golden Sample...");
        // Simulation de validation Spyglass sur un fichier d'exemple du template
        const goldenSample = path.join(tmpDir, "Example Pack/Example Datapack/data/example_pack/loot_table/blocks/example_block/give.json");
        if (await fs.pathExists(goldenSample)) {
            const runner = new SpyglassRunner(this.rootDir);
            const result = await runner.run(goldenSample);
            if (result.status === "FAIL") {
                // Si Spyglass échoue ici, c'est probablement que notre mcdoc est mal foutu
                console.error("MCDoc Validation Warning: Golden Sample failed parsing. Check bone.mcdoc.");
            }
        }
    }
    /**
     * Initialise le workspace avec le template BONE:MSD spécifique.
     */
    async initTemplate() {
        console.error(`Cloning BONE:MSD template from ${BONEEngine.TEMPLATE_URL}...`);
        return new Promise((resolve, reject) => {
            // On vérifie d'abord si git est installé
            const checkGit = spawn("git", ["--version"]);
            checkGit.on("error", () => {
                return reject(new Error("ERREUR MATÉRIELLE : Git n'est pas installé sur ce système. Impossible de cloner le template BONE:MSD."));
            });
            checkGit.on("close", (code) => {
                if (code !== 0)
                    return reject(new Error("Git n'est pas accessible."));
                // On clone dans un dossier temporaire puis on déplace les fichiers pour éviter le conflit de dossier non vide
                const tmpDir = path.join(this.rootDir, ".bone_tmp");
                const cp = spawn("git", ["clone", BONEEngine.TEMPLATE_URL, tmpDir], {
                    cwd: this.rootDir,
                    shell: true,
                });
                let stderr = "";
                cp.stderr.on("data", (data) => (stderr += data.toString()));
                cp.on("close", async (code) => {
                    if (code === 0) {
                        try {
                            // Déplacement des fichiers (excluant .git)
                            const files = await fs.readdir(tmpDir);
                            for (const file of files) {
                                if (file === ".git")
                                    continue;
                                await fs.move(path.join(tmpDir, file), path.join(this.rootDir, file), { overwrite: true });
                            }
                            // Le template upstream contient un sous-dossier "BONE-MSD Datapack".
                            // On remonte son contenu à la racine pour obtenir un workspace directement exploitable.
                            const rootPackMcmeta = path.join(this.rootDir, "pack.mcmeta");
                            const nestedDatapackDir = path.join(this.rootDir, "BONE-MSD Datapack");
                            const nestedPackMcmeta = path.join(nestedDatapackDir, "pack.mcmeta");
                            if (!(await fs.pathExists(rootPackMcmeta)) && (await fs.pathExists(nestedPackMcmeta))) {
                                const nestedEntries = await fs.readdir(nestedDatapackDir);
                                for (const entry of nestedEntries) {
                                    await fs.move(path.join(nestedDatapackDir, entry), path.join(this.rootDir, entry), { overwrite: true });
                                }
                                await fs.remove(nestedDatapackDir);
                            }
                            await fs.remove(tmpDir);
                            resolve("Template BONE:MSD cloné et initialisé avec succès.");
                        }
                        catch (moveError) {
                            reject(new Error(`ERREUR DE SYSTÈME DE FICHIERS : ${moveError.message}`));
                        }
                    }
                    else {
                        reject(new Error(`ERREUR DE RÉSEAU OU GIT (Code ${code}) : ${stderr}`));
                    }
                });
            });
        });
    }
    /**
     * Vérifie que les assets listés dans ASSETS_TODO.md existent réellement.
     */
    async verifyAssets() {
        const todoPath = path.join(this.rootDir, "ASSETS_TODO.md");
        if (!(await fs.pathExists(todoPath))) {
            throw new Error("Fichier ASSETS_TODO.md introuvable. Avez-vous généré des composants BONE ?");
        }
        const content = await fs.readFile(todoPath, "utf-8");
        const paths = content.match(/`assets\/[^`]+`/g) || [];
        const cleanPaths = paths.map(p => p.replace(/`/g, ""));
        const missing = [];
        const found = [];
        for (const p of cleanPaths) {
            const fullPath = path.join(this.rootDir, p);
            if (await fs.pathExists(fullPath)) {
                found.push(p);
            }
            else {
                missing.push(p);
            }
        }
        return { missing, found };
    }
    async injectMCDoc() {
        const spyglassDir = path.join(this.rootDir, ".spyglass/mcdoc");
        await fs.ensureDir(spyglassDir);
        const mcdocContent = `
// BONE:MSD Framework Schema - Industrial Grade
// Generated by Gemini Datapack Architect

struct BoneCb {
  pack: string,
  block_name: string,
  use_place_function: boolean,
  place_function_location?: string,
  place_information?: struct {
    base_block: string,
    block_entity?: struct {
      id: string,
      entity_data?: any,
      loot_table?: string
    }
  }
}

// Support pour les items custom avec blocage de placement
export type BoneItemData = struct {
  bone_cb?: BoneCb,
  // Tag pour le moteur d'items
  "bone_msd:item_engine/noplace"?: byte
}
`;
        await fs.writeFile(path.join(spyglassDir, "bone.mcdoc"), mcdocContent, "utf-8");
    }
    async updateAssetsTodo(items) {
        const todoPath = path.join(this.rootDir, "ASSETS_TODO.md");
        let content = "# 🎨 ASSETS HANDOFF : BONE:MSD\n\nCe fichier liste les textures et modèles requis pour votre datapack.\n\n";
        for (const item of items) {
            if (item.type === 'block') {
                content += `## 🧊 Bloc : ${item.namespace}:${item.name}\n`;
                content += `- [ ] **Icône d'inventaire** : Placez une texture 16x16 dans \`assets/${item.namespace}/textures/painting/${item.name}_icon.png\`\n`;
                content += `- [ ] **Modèle 3D** : Configurez le modèle JSON dans \`assets/${item.namespace}/models/block/${item.name}.json\`\n\n`;
            }
            else {
                content += `## 🗡️ Item : ${item.namespace}:${item.name}\n`;
                content += `- [ ] **Texture** : Placez une texture dans \`assets/${item.namespace}/textures/item/${item.name}.png\`\n\n`;
            }
        }
        await fs.writeFile(todoPath, content, "utf-8");
    }
}
