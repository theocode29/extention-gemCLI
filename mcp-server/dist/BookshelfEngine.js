import fs from "fs-extra";
import path from "path";
import axios from "axios";
import AdmZip from "adm-zip";
export class BookshelfEngine {
    rootDir;
    static ZIP_URL = "https://github.com/mcbookshelf/bookshelf/archive/refs/heads/master.zip";
    static BONE_URL = "https://github.com/BONE-MSD/core/archive/refs/heads/main.zip";
    constructor(rootDir) {
        this.rootDir = rootDir;
    }
    /**
     * Unified Ingest: Bookshelf + BONE:MSD Core
     */
    async ingest() {
        const docsDir = path.join(this.rootDir, ".docs");
        const tmpDir = path.join(docsDir, ".ingest_tmp");
        const zipPath = path.join(docsDir, "bookshelf_latest.zip");
        const sentinelPath = path.join(docsDir, "bs_cache_extracted/.success");
        await fs.ensureDir(docsDir);
        const knowledge = {
            version: "latest",
            last_ingest: new Date().toISOString(),
            modules: [],
            core_apis: [],
            dependencies: {},
            readme_summary: ""
        };
        console.error(`Ingesting all libraries...`);
        try {
            // 1. Bookshelf Processing
            if (!(await fs.pathExists(zipPath))) {
                const response = await axios.get(BookshelfEngine.ZIP_URL, { responseType: 'arraybuffer' });
                await fs.writeFile(zipPath, response.data);
            }
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(tmpDir, true);
            const modulesDir = path.join(tmpDir, "bookshelf-master/modules");
            const moduleFolders = await fs.readdir(modulesDir);
            for (const folder of moduleFolders) {
                if (folder.startsWith("@"))
                    continue;
                const modulePath = path.join(modulesDir, folder);
                if (!(await fs.stat(modulePath)).isDirectory())
                    continue;
                knowledge.modules.push(folder);
                knowledge.dependencies[folder] = [];
                const dataDir = path.join(modulePath, "data");
                if (await fs.pathExists(dataDir)) {
                    const namespaces = await fs.readdir(dataDir);
                    for (const ns of namespaces) {
                        const funcDir = path.join(dataDir, ns, "function");
                        if (await fs.pathExists(funcDir)) {
                            const funcs = await this.listFunctionsRecursive(funcDir);
                            knowledge.core_apis = knowledge.core_apis.concat(funcs.map(f => `${ns}:${f}`));
                            // Dependency RAG Scan
                            for (const f of funcs) {
                                const content = await fs.readFile(path.join(funcDir, `${f}.mcfunction`), "utf-8");
                                const matches = content.match(/function\s+#?bs\.([a-z_]+):/g);
                                if (matches) {
                                    for (const m of matches) {
                                        const dep = m.replace("function ", "").replace("#", "").split(":")[0].split("bs.")[1];
                                        if (dep && dep !== folder && !knowledge.dependencies[folder].includes(dep)) {
                                            knowledge.dependencies[folder].push(dep);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            // 2. BONE:MSD Core Processing (Add to cognition)
            const boneDataPath = path.join(this.rootDir, "data/bone_msd");
            if (await fs.pathExists(boneDataPath)) {
                const boneFuncs = await this.listFunctionsRecursive(path.join(boneDataPath, "function"));
                knowledge.core_apis = knowledge.core_apis.concat(boneFuncs.map(f => `bone_msd:${f}`));
            }
            // 3. Finalize
            await fs.writeJson(path.join(docsDir, "bookshelf.json"), knowledge, { spaces: 2 });
            // Move tmp to final cache and add sentinel
            const finalCache = path.join(docsDir, "bs_cache_extracted");
            await fs.remove(finalCache);
            await fs.move(tmpDir, finalCache);
            await fs.writeFile(sentinelPath, "OK");
            return `Ingestion complète : ${knowledge.modules.length} modules Bookshelf + BONE:MSD indexés.`;
        }
        catch (e) {
            await fs.remove(tmpDir).catch(() => { });
            throw new Error(`ERREUR D'INGESTION : ${e.message}`);
        }
    }
    async addDependency(libName, targetModules) {
        const docsDir = path.join(this.rootDir, ".docs");
        const targetDataDir = path.join(this.rootDir, "data");
        const cacheDir = path.join(docsDir, "bs_cache_extracted");
        const sentinelPath = path.join(cacheDir, ".success");
        // Robust Cache Validation
        if (!(await fs.pathExists(sentinelPath))) {
            console.error("Cache invalide ou inexistant. Lancement de l'ingestion...");
            await this.ingest();
        }
        if (libName === "bone_msd") {
            await fs.copy(path.join(cacheDir, "bone_tmp/core-main/data/bone_msd"), path.join(targetDataDir, "bone_msd")).catch(async () => {
                // Si BONE n'est pas dans le cache (ingest simple), on le télécharge spécifiquement
                const response = await axios.get(BookshelfEngine.BONE_URL, { responseType: 'arraybuffer' });
                const zip = new AdmZip(Buffer.from(response.data));
                zip.extractAllTo(path.join(docsDir, "bone_tmp"), true);
                await fs.copy(path.join(docsDir, "bone_tmp/core-main/data/bone_msd"), path.join(targetDataDir, "bone_msd"));
            });
            return "BONE:MSD Core installé.";
        }
        const knowledge = await fs.readJson(path.join(docsDir, "bookshelf.json"));
        const toInstall = new Set();
        const processed = new Set();
        const resolve = (m) => {
            if (processed.has(m) || !knowledge.modules.includes(m))
                return;
            processed.add(m);
            toInstall.add(m);
            (knowledge.dependencies[m] || []).forEach(resolve);
        };
        resolve("core");
        (targetModules || []).forEach(resolve);
        for (const mod of toInstall) {
            const modPath = path.join(cacheDir, "bookshelf-master/modules", mod, "data");
            if (await fs.pathExists(modPath)) {
                await fs.copy(modPath, targetDataDir, { overwrite: true });
            }
        }
        return `Modules installés avec succès : ${Array.from(toInstall).join(", ")}`;
    }
    async listFunctionsRecursive(dir, base = "") {
        if (!(await fs.pathExists(dir)))
            return [];
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
    async injectMCDoc() {
        const mcdocContent = `
// Bookshelf Library Schema
// Generated by Gemini Datapack Architect

struct BookshelfEntity {
    tag: string,
    persistent: boolean
}

export type BookshelfData = struct {
    bs?: struct {
        id: int,
        version: string,
        modules: [string]
    }
};
`;
        await fs.ensureDir(path.join(this.rootDir, ".spyglass/mcdoc"));
        await fs.writeFile(path.join(this.rootDir, ".spyglass/mcdoc/bookshelf.mcdoc"), mcdocContent, "utf-8");
    }
}
