import fs from "fs-extra";
import path from "path";
import { CallGraphAnalyzer } from "./CallGraphAnalyzer.js";
export class BONESemanticLinter {
    rootDir;
    constructor(rootDir) {
        this.rootDir = rootDir;
    }
    /**
     * Analyse un fichier ou un dossier pour vérifier le respect des lois BONE.
     */
    async lint(targetPath) {
        const fullPath = path.resolve(this.rootDir, targetPath);
        const errors = [];
        if (!(await fs.pathExists(fullPath))) {
            return { status: "PASS", errors: [] };
        }
        const stat = await fs.stat(fullPath);
        const relativePath = path.relative(this.rootDir, fullPath).replace(/\\/g, "/");
        if (stat.isDirectory()) {
            await this.lintDirectory(fullPath, errors);
            const dataDir = path.join(this.rootDir, "data");
            if (await fs.pathExists(dataDir)) {
                await this.lintRecursiveCycles(dataDir, errors);
            }
        }
        else {
            await this.lintFile(fullPath, errors);
            if (fullPath.endsWith(".mcfunction") && relativePath.includes("data/")) {
                const dataDir = path.join(this.rootDir, "data");
                if (await fs.pathExists(dataDir)) {
                    await this.lintRecursiveCycles(dataDir, errors);
                }
            }
        }
        return {
            status: errors.length > 0 ? "FAIL" : "PASS",
            errors,
        };
    }
    async lintRecursiveCycles(dataDir, errors) {
        const analyzer = new CallGraphAnalyzer(dataDir);
        await analyzer.scan();
        const cycles = analyzer.findCycles();
        const nodes = analyzer.getNodes();
        for (const cycle of cycles) {
            for (const funcId of cycle) {
                const node = nodes.get(funcId);
                if (!node)
                    continue;
                if (node.hasNBTWrite) {
                    errors.push(`[BLOCKING SCC-NBT] La fonction ${funcId} appartient à un cycle récursif et effectue une écriture NBT d'entité. INTERDIT.`);
                }
                if (node.hasVolatileMacro) {
                    errors.push(`[BLOCKING SCC-MACRO] La fonction ${funcId} appartient à un cycle récursif et utilise une Macro ($). INTERDIT.`);
                }
            }
        }
    }
    async lintDirectory(dir, errors) {
        const files = await fs.readdir(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = await fs.stat(fullPath);
            if (stat.isDirectory()) {
                await this.lintDirectory(fullPath, errors);
            }
            else {
                await this.lintFile(fullPath, errors);
            }
        }
    }
    async lintFile(filePath, errors) {
        const relativePath = path.relative(this.rootDir, filePath).replace(/\\/g, "/");
        if (relativePath.includes("data/bone_msd/")) {
            errors.push(`[CRITICAL] Modification interdite du Core BONE:MSD (${relativePath}). Utilisez votre propre namespace.`);
            return;
        }
        if (filePath.endsWith(".mcfunction")) {
            const content = await fs.readFile(filePath, "utf-8");
            const isFunctionsDir = relativePath.includes("/functions/") || relativePath.includes("/function/");
            const isExcludedFile = filePath.endsWith("load.mcfunction") || filePath.endsWith("init.mcfunction");
            const isImmutableLibrary = relativePath.includes("data/bs.") || relativePath.includes("data/minecraft/") || relativePath.includes("data/bone_msd/");
            if (isFunctionsDir && !isExcludedFile) {
                if (content.match(/@(p|a|r)(\[| |$|\n)/g)) {
                    errors.push(`[BLOCKING SELECTOR] Usage of vague selector (@p, @a, or @r) detected in ${relativePath}. Use @s and UIDs/Tags for precise targeting.`);
                }
            }
            if (content.includes("@s") && !content.includes("execute as @s at @s")) {
                errors.push(`[BLOCKING CONTEXT] Function ${relativePath} uses @s but is missing the mandatory 'execute as @s at @s' context validation.`);
            }
            const manualRaycast = content.match(/tp\s+@s\s+\^\s*\^\s*\^/g);
            const legacyRaycast = content.includes("bone_msd:utils/raycast");
            if (manualRaycast || legacyRaycast) {
                errors.push(`[BLOCKING LIBRARY] Manual or legacy raycast detected in ${relativePath}. You MUST use 'function bs.raycast:trigger' (Bookshelf).`);
            }
            if ((content.includes("power") || content.includes("impulse")) && !content.includes("redstone_powered") && relativePath.includes("blocks")) {
                errors.push(`[LOI 2] Logique Redstone suspecte sans tag 'redstone_powered' dans ${relativePath}.`);
            }
            // Bookshelf Safety Rule : Persistent Entities Protection (Universal)
            if (!isImmutableLibrary) {
                const activeLines = content.split("\n").filter(line => !line.trim().startsWith("#") && !line.trim().startsWith("//"));
                const activeContent = activeLines.join("\n");
                // Regex robuste :
                // 1. @e sans crochets : @e(?![\[])
                // 2. @e avec crochets ne contenant ni tag=!bs.persistent ni type=player
                const unsafeSelector = /@e(\[(?![^\]]*tag=!bs\.persistent)(?![^\]]*type=(minecraft:)?player)[^\]]*\]|(?![\[]))/g;
                if (activeContent.match(unsafeSelector)) {
                    errors.push(`[CRITICAL SAFETY] Unsafe @e selector detected in ${relativePath}. Any global @e selector MUST include 'tag=!bs.persistent' to protect Bookshelf calculation entities.`);
                }
            }
        }
        if (filePath.endsWith("give.json") && (relativePath.includes("loot_table") || relativePath.includes("loot_tables"))) {
            const content = await fs.readFile(filePath, "utf-8");
            if (!content.includes("minecraft:barrier")) {
                errors.push(`[LOI 1] Tout bloc custom BONE:MSD doit utiliser 'minecraft:barrier' comme item de base (${relativePath}).`);
            }
            if (!content.includes("bone_cb")) {
                errors.push(`[LOI 1] Tag 'bone_cb' manquant dans la loot table give (${relativePath}).`);
            }
        }
    }
}
