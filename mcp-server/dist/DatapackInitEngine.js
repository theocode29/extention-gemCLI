import fs from "fs-extra";
import path from "path";
const WORLDGEN_SUBDIRS = [
    "biome",
    "configured_carver",
    "configured_feature",
    "configured_structure_feature",
    "configured_surface_builder",
    "noise_settings",
    "processor_list",
    "template_pool",
];
function compareVersions(a, b) {
    if (a.major !== b.major)
        return a.major - b.major;
    if (a.minor !== b.minor)
        return a.minor - b.minor;
    return a.patch - b.patch;
}
function parseVersion(version) {
    const normalized = version.trim();
    const match = normalized.match(/^(\d+)\.(\d+)(?:\.(\d+))?$/);
    if (!match) {
        throw new Error(`Version invalide: '${version}'. Format attendu: 1.20.2, 1.21.5, etc.`);
    }
    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: match[3] ? Number(match[3]) : 0,
    };
}
function normalizeVersion(v) {
    return `${v.major}.${v.minor}.${v.patch}`;
}
function ensureSupportedVersion(v) {
    const min = { major: 1, minor: 20, patch: 2 };
    if (compareVersions(v, min) < 0) {
        throw new Error("Version non supportée. Cet initialiseur supporte uniquement Minecraft Java 1.20.2+.");
    }
}
function resolvePackFormat(v) {
    // Source targets requested in spec:
    // 1.20.5 -> 41, 1.21 -> 48, 1.21.5 -> 71, 1.21.6 -> 80, 1.21.7+ -> 81
    const v1205 = { major: 1, minor: 20, patch: 5 };
    const v1210 = { major: 1, minor: 21, patch: 0 };
    const v1215 = { major: 1, minor: 21, patch: 5 };
    const v1216 = { major: 1, minor: 21, patch: 6 };
    const v1217 = { major: 1, minor: 21, patch: 7 };
    if (compareVersions(v, v1217) >= 0)
        return 81;
    if (compareVersions(v, v1216) >= 0)
        return 80;
    if (compareVersions(v, v1215) >= 0)
        return 71;
    if (compareVersions(v, v1210) >= 0)
        return 48;
    if (compareVersions(v, v1205) >= 0)
        return 41;
    return 18; // 1.20.2 -> 1.20.4 generation
}
function validateNamespace(namespace) {
    const normalized = namespace.trim();
    if (!normalized) {
        throw new Error("Namespace requis.");
    }
    if (!/^[a-z0-9_.-]+$/.test(normalized)) {
        throw new Error("Namespace invalide. Caractères autorisés: lettres minuscules, chiffres, underscore (_), point (.), tiret (-).");
    }
    return normalized;
}
export class DatapackInitEngine {
    rootDir;
    constructor(rootDir) {
        this.rootDir = rootDir;
    }
    resolveVersionSpec(version) {
        const parsed = parseVersion(version);
        ensureSupportedVersion(parsed);
        const v1202 = { major: 1, minor: 20, patch: 2 };
        const v1210 = { major: 1, minor: 21, patch: 0 };
        const v1215 = { major: 1, minor: 21, patch: 5 };
        const v1216 = { major: 1, minor: 21, patch: 6 };
        const v1219 = { major: 1, minor: 21, patch: 9 };
        return {
            normalizedVersion: normalizeVersion(parsed),
            packFormat: resolvePackFormat(parsed),
            supportsOverlays: compareVersions(parsed, v1202) >= 0,
            supportsSingularFolders: compareVersions(parsed, v1210) >= 0,
            supportsDataDrivenEnchantments: compareVersions(parsed, v1210) >= 0,
            supportsGameTests: compareVersions(parsed, v1215) >= 0,
            strictJsonParsing: compareVersions(parsed, v1216) >= 0,
            usesMinMaxFormatModel: compareVersions(parsed, v1219) >= 0,
        };
    }
    async initProject(input) {
        const profile = input.profile ?? "minimal";
        if (!["minimal", "worldgen", "tests", "full"].includes(profile)) {
            throw new Error(`Profil invalide: '${input.profile}'. Valeurs autorisées: minimal|worldgen|tests|full.`);
        }
        const namespace = validateNamespace(input.namespace);
        const spec = this.resolveVersionSpec(input.version);
        const existingPackMcmeta = path.join(this.rootDir, "pack.mcmeta");
        if (await fs.pathExists(existingPackMcmeta)) {
            throw new Error("Initialisation refusée: pack.mcmeta existe déjà dans le workspace.");
        }
        const createdPaths = [];
        const warnings = [];
        await this.writePackMcmeta(spec, createdPaths);
        const folders = this.buildFolderPlan(spec, namespace, profile, warnings);
        for (const relPath of folders) {
            const fullPath = path.join(this.rootDir, relPath);
            await fs.ensureDir(fullPath);
            createdPaths.push(relPath);
        }
        await this.writeBootstrapFiles(spec, namespace, createdPaths);
        if (profile === "tests" && !spec.supportsGameTests) {
            warnings.push("Le profil 'tests' a été demandé sur une version sans Game Tests data-driven. Aucun dossier de tests n'a été créé.");
        }
        return {
            message: "Datapack initialisé avec succès (sans bibliothèques BONE/Bookshelf).",
            profile,
            namespace,
            resolvedVersion: spec,
            createdPaths,
            warnings,
        };
    }
    async writePackMcmeta(spec, createdPaths) {
        const mcmetaPath = path.join(this.rootDir, "pack.mcmeta");
        const packSection = {
            description: "Datapack scaffold generated by datapack-tools",
        };
        if (spec.usesMinMaxFormatModel) {
            packSection.min_format = spec.packFormat;
            packSection.max_format = spec.packFormat;
            packSection.pack_format = spec.packFormat;
        }
        else {
            packSection.pack_format = spec.packFormat;
            packSection.supported_formats = [spec.packFormat];
        }
        const payload = {
            pack: packSection,
        };
        await fs.writeJson(mcmetaPath, payload, { spaces: 2 });
        createdPaths.push("pack.mcmeta");
    }
    buildFolderPlan(spec, namespace, profile, warnings) {
        const functionDir = spec.supportsSingularFolders ? "function" : "functions";
        const advancementDir = spec.supportsSingularFolders ? "advancement" : "advancements";
        const recipeDir = spec.supportsSingularFolders ? "recipe" : "recipes";
        const lootTableDir = spec.supportsSingularFolders ? "loot_table" : "loot_tables";
        const predicateDir = spec.supportsSingularFolders ? "predicate" : "predicates";
        const itemModifierDir = spec.supportsSingularFolders ? "item_modifier" : "item_modifiers";
        const structureDir = spec.supportsSingularFolders ? "structure" : "structures";
        const tagFunctionDir = spec.supportsSingularFolders ? "function" : "functions";
        const tagItemDir = spec.supportsSingularFolders ? "item" : "items";
        const tagBlockDir = spec.supportsSingularFolders ? "block" : "blocks";
        const tagEntityTypeDir = spec.supportsSingularFolders ? "entity_type" : "entity_types";
        const tagFluidDir = spec.supportsSingularFolders ? "fluid" : "fluids";
        const tagGameEventDir = spec.supportsSingularFolders ? "game_event" : "game_events";
        const base = `data/${namespace}`;
        const folders = new Set([
            "data",
            base,
            `${base}/${functionDir}`,
            `${base}/${advancementDir}`,
            `${base}/${recipeDir}`,
            `${base}/${lootTableDir}`,
            `${base}/${predicateDir}`,
            `${base}/${itemModifierDir}`,
            `${base}/${structureDir}`,
            `${base}/tags/${tagFunctionDir}`,
            `${base}/tags/${tagItemDir}`,
            `${base}/tags/${tagBlockDir}`,
            `${base}/tags/${tagEntityTypeDir}`,
            `${base}/tags/${tagFluidDir}`,
            `${base}/tags/${tagGameEventDir}`,
            "data/minecraft",
            "data/minecraft/tags",
            `data/minecraft/tags/${tagFunctionDir}`,
        ]);
        if (profile === "worldgen" || profile === "full") {
            folders.add(`${base}/worldgen`);
            for (const sub of WORLDGEN_SUBDIRS) {
                folders.add(`${base}/worldgen/${sub}`);
            }
            folders.add(`${base}/dimension`);
            folders.add(`${base}/dimension_type`);
        }
        if (profile === "tests" || profile === "full") {
            if (spec.supportsGameTests) {
                folders.add(`${base}/test_instance`);
                folders.add(`${base}/test_environment`);
            }
            else {
                warnings.push("Les Game Tests via datapack ne sont pas supportés pour cette version cible.");
            }
        }
        if (profile === "full") {
            folders.add(`${base}/damage_type`);
            if (spec.supportsDataDrivenEnchantments) {
                folders.add(`${base}/enchantment`);
                folders.add(`${base}/enchantment_provider`);
                folders.add(`${base}/painting_variant`);
                folders.add(`${base}/jukebox_song`);
            }
            // Mentionné dans votre doc de référence pour les versions récentes.
            if (spec.packFormat >= 81) {
                folders.add(`${base}/world_clock`);
            }
            if (spec.supportsOverlays) {
                folders.add("overlays");
            }
        }
        return Array.from(folders).sort();
    }
    async writeBootstrapFiles(spec, namespace, createdPaths) {
        const functionDir = spec.supportsSingularFolders ? "function" : "functions";
        const tagFunctionDir = spec.supportsSingularFolders ? "function" : "functions";
        const loadFunctionRelPath = `data/${namespace}/${functionDir}/load.mcfunction`;
        const loadFunctionContent = [
            "# Datapack bootstrap",
            "# Called by minecraft load tag",
            `tellraw @a [{\"text\":\"[${namespace}] loaded\",\"color\":\"green\"}]`,
            "",
        ].join("\n");
        await fs.writeFile(path.join(this.rootDir, loadFunctionRelPath), loadFunctionContent, "utf-8");
        createdPaths.push(loadFunctionRelPath);
        const loadTagRelPath = `data/minecraft/tags/${tagFunctionDir}/load.json`;
        const loadTagContent = {
            values: [`${namespace}:load`],
        };
        await fs.writeJson(path.join(this.rootDir, loadTagRelPath), loadTagContent, { spaces: 2 });
        createdPaths.push(loadTagRelPath);
    }
}
