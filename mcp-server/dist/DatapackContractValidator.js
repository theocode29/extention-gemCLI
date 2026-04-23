import fs from "fs-extra";
import path from "path";
import { glob } from "glob";
export class DatapackContractValidator {
    rootDir;
    constructor(rootDir) {
        this.rootDir = rootDir;
    }
    async readJsonIfExists(p) {
        if (!(await fs.pathExists(p)))
            return null;
        return (await fs.readJson(p));
    }
    normalizeFunctionPath(namespace, rel) {
        return `data/${namespace}/function/${rel}.mcfunction`;
    }
    async validate() {
        const errors = [];
        const warnings = [];
        const details = {
            advancementCount: 0,
            functionCount: 0,
        };
        const packPath = path.join(this.rootDir, "pack.mcmeta");
        const pack = await this.readJsonIfExists(packPath);
        if (!pack?.pack || typeof pack.pack.pack_format !== "number") {
            errors.push("pack.mcmeta invalide: champ pack.pack_format manquant.");
        }
        else {
            const packFormat = pack.pack.pack_format;
            details.packFormat = packFormat;
            const rawSupported = pack.pack.supported_formats;
            if (packFormat <= 81) {
                if (!Array.isArray(rawSupported) || rawSupported.length !== 2) {
                    errors.push("pack.mcmeta invalide: pour pack_format <= 81, supported_formats doit être [min,max] (ex: [81,81]).");
                }
                else {
                    const supportedFormats = rawSupported.map((x) => Number(x));
                    details.supportedFormats = supportedFormats;
                    if (!Number.isFinite(supportedFormats[0]) ||
                        !Number.isFinite(supportedFormats[1]) ||
                        supportedFormats[0] > supportedFormats[1] ||
                        packFormat < supportedFormats[0] ||
                        packFormat > supportedFormats[1]) {
                        errors.push(`pack.mcmeta incohérent: pack_format=${packFormat} hors plage supported_formats=[${supportedFormats.join(",")}].`);
                    }
                }
            }
        }
        const tickCandidates = [
            "data/minecraft/tags/function/tick.json",
            "data/minecraft/tags/functions/tick.json",
        ];
        const loadCandidates = [
            "data/minecraft/tags/function/load.json",
            "data/minecraft/tags/functions/load.json",
        ];
        const tickTagPath = tickCandidates.find((p) => fs.existsSync(path.join(this.rootDir, p)));
        const loadTagPath = loadCandidates.find((p) => fs.existsSync(path.join(this.rootDir, p)));
        details.tickTagPath = tickTagPath;
        details.loadTagPath = loadTagPath;
        if (!tickTagPath)
            errors.push("Tag tick manquant: data/minecraft/tags/function/tick.json");
        if (!loadTagPath)
            errors.push("Tag load manquant: data/minecraft/tags/function/load.json");
        const tickTag = tickTagPath
            ? await this.readJsonIfExists(path.join(this.rootDir, tickTagPath))
            : null;
        const loadTag = loadTagPath
            ? await this.readJsonIfExists(path.join(this.rootDir, loadTagPath))
            : null;
        if (tickTagPath && (!tickTag?.values || tickTag.values.length === 0)) {
            errors.push("Tag tick invalide: values vide.");
        }
        if (loadTagPath && (!loadTag?.values || loadTag.values.length === 0)) {
            errors.push("Tag load invalide: values vide.");
        }
        const functionFiles = await glob("data/*/{function,functions}/**/*.mcfunction", {
            cwd: this.rootDir,
            nodir: true,
            ignore: ["**/._*"],
        });
        details.functionCount = functionFiles.length;
        if (functionFiles.length === 0) {
            errors.push("Aucune fonction mcfunction détectée sous data/*/function(s)/.");
        }
        const advancements = await glob("data/*/{advancement,advancements}/**/*.json", {
            cwd: this.rootDir,
            nodir: true,
            ignore: ["**/._*"],
        });
        details.advancementCount = advancements.length;
        for (const advPath of advancements) {
            try {
                const adv = (await fs.readJson(path.join(this.rootDir, advPath)));
                const criteria = adv.criteria;
                if (!criteria || Object.keys(criteria).length === 0) {
                    errors.push(`Advancement invalide (${advPath}): criteria vide.`);
                    continue;
                }
                for (const [criterionName, criterionValue] of Object.entries(criteria)) {
                    const criterion = criterionValue;
                    if (!criterion || typeof criterion.trigger !== "string") {
                        errors.push(`Advancement invalide (${advPath}): trigger manquant pour le critère '${criterionName}'.`);
                    }
                }
            }
            catch (e) {
                errors.push(`Advancement illisible (${advPath}): ${e.message}`);
            }
        }
        const referencedFunctions = [
            ...(tickTag?.values ?? []),
            ...(loadTag?.values ?? []),
        ].filter((v) => typeof v === "string");
        for (const ref of referencedFunctions) {
            if (ref.startsWith("#"))
                continue;
            const [ns, rel] = ref.split(":");
            if (!ns || !rel) {
                errors.push(`Référence de fonction invalide dans tag: ${ref}`);
                continue;
            }
            const fnPath = this.normalizeFunctionPath(ns, rel);
            if (!(await fs.pathExists(path.join(this.rootDir, fnPath)))) {
                const altPath = fnPath.replace("/function/", "/functions/");
                if (!(await fs.pathExists(path.join(this.rootDir, altPath)))) {
                    errors.push(`Fonction référencée introuvable depuis tag: ${ref}`);
                }
            }
        }
        if (loadTag?.values?.length) {
            let hasScoreboardBootstrap = false;
            for (const ref of loadTag.values) {
                if (!ref || ref.startsWith("#"))
                    continue;
                const [ns, rel] = ref.split(":");
                if (!ns || !rel)
                    continue;
                const candidates = [
                    path.join(this.rootDir, this.normalizeFunctionPath(ns, rel)),
                    path.join(this.rootDir, this.normalizeFunctionPath(ns, rel).replace("/function/", "/functions/")),
                ];
                for (const p of candidates) {
                    if (!(await fs.pathExists(p)))
                        continue;
                    const content = await fs.readFile(p, "utf-8");
                    if (content.includes("scoreboard objectives add")) {
                        hasScoreboardBootstrap = true;
                        break;
                    }
                }
                if (hasScoreboardBootstrap)
                    break;
            }
            if (!hasScoreboardBootstrap) {
                warnings.push("Aucun bootstrap scoreboard détecté dans les fonctions load taguées. Vérifier l'initialisation runtime.");
            }
        }
        return {
            pass: errors.length === 0,
            errors,
            warnings,
            details,
        };
    }
}
