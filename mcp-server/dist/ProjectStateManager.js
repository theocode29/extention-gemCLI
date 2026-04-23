import fs from "fs-extra";
import path from "path";
import { glob } from "glob";
import crypto from "crypto";
export class ProjectStateManager {
    stateFile = ".gemini-project.json";
    rootDir;
    constructor(rootDir) {
        this.rootDir = rootDir;
    }
    getStatePath() {
        return path.join(this.rootDir, this.stateFile);
    }
    async loadState() {
        const statePath = this.getStatePath();
        if (await fs.pathExists(statePath)) {
            try {
                return await fs.readJson(statePath);
            }
            catch (e) {
                console.error("Error reading state file, resetting state.");
            }
        }
        return { files: {}, dependencies: {} };
    }
    async saveState(state) {
        await fs.writeJson(this.getStatePath(), state, { spaces: 2 });
    }
    calculateHash(content) {
        return crypto.createHash("sha256").update(content).digest("hex");
    }
    async getManualModifications() {
        const storedState = await this.loadState();
        // Recursive scan for mcfunction, json, and mcmeta files
        const currentFiles = await glob("{data/**/*,pack.mcmeta}", {
            cwd: this.rootDir,
            nodir: true,
            ignore: ["node_modules/**", ".git/**", "dist/**", "gametests/**", "**/._*", "**/.DS_Store", this.stateFile],
        });
        const report = {
            added: [],
            modified: [],
            deleted: [],
        };
        const currentFileSet = new Set(currentFiles);
        for (const file of currentFiles) {
            const fullPath = path.join(this.rootDir, file);
            const content = await fs.readFile(fullPath, "utf-8");
            const hash = this.calculateHash(content);
            if (!storedState.files[file]) {
                report.added.push(file);
            }
            else if (storedState.files[file].hash !== hash) {
                report.modified.push(file);
            }
        }
        for (const file in storedState.files) {
            if (!currentFileSet.has(file)) {
                report.deleted.push(file);
            }
        }
        // Détection d'impacts BONE spécifiques
        const boneImpacts = [];
        [...report.added, ...report.modified].forEach(file => {
            if (file.includes("loot_table/blocks/")) {
                const parts = file.split("/");
                // On essaie de deviner le namespace et le nom du bloc
                // data/namespace/loot_table/blocks/block_name/give.json
                if (parts.length >= 6) {
                    const namespace = parts[1];
                    const blockName = parts[4];
                    boneImpacts.push(`Impact détecté : Le bloc '${namespace}:${blockName}' a été modifié. Vérifiez la cohérence de 'painting_variant/${namespace}/blocks/${blockName}.json'`);
                }
            }
        });
        return { ...report, boneImpacts, dependencies: storedState.dependencies };
    }
    async updateFileState(filePath, content) {
        const state = await this.loadState();
        const relativePath = path.relative(this.rootDir, path.resolve(this.rootDir, filePath));
        state.files[relativePath] = { hash: this.calculateHash(content) };
        await this.saveState(state);
    }
    async removeFileState(filePath) {
        const state = await this.loadState();
        const relativePath = path.relative(this.rootDir, path.resolve(this.rootDir, filePath));
        delete state.files[relativePath];
        await this.saveState(state);
    }
    async syncAll() {
        const files = await glob("{data/**/*,pack.mcmeta}", {
            cwd: this.rootDir,
            nodir: true,
            ignore: ["node_modules/**", ".git/**", "dist/**", "gametests/**", "**/._*", "**/.DS_Store", this.stateFile],
        });
        const storedState = await this.loadState();
        const newState = { files: {}, dependencies: storedState.dependencies || {} };
        for (const file of files) {
            try {
                const content = await fs.readFile(path.join(this.rootDir, file), "utf-8");
                newState.files[file] = { hash: this.calculateHash(content) };
            }
            catch (e) {
                console.error(`Could not read file ${file} during sync.`);
            }
        }
        await this.saveState(newState);
    }
}
