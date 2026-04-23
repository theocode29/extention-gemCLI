import fs from "fs-extra";
import path from "path";
import axios from "axios";

export const CAPABILITIES = [
  "physics",
  "entity-control",
  "interaction",
  "worldgen",
  "math",
  "ui-feedback",
  "random",
  "block-ops",
  "debug-observability",
  "performance",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

type RawManifestModule = {
  id: string;
  name?: string;
  description?: string;
  tags?: string[];
  documentation?: string;
  dependencies?: string[];
  weak_dependencies?: string[];
};

type RawManifest = {
  modules?: RawManifestModule[];
};

export interface CapabilityModule {
  id: string;
  name: string;
  description: string;
  tags: string[];
  documentation?: string;
  dependencies: string[];
  weakDependencies: string[];
  capabilities: Capability[];
}

export interface CapabilityCatalog {
  version: string;
  source: {
    manifestUrl: string;
    generatedAt: string;
  };
  modules: CapabilityModule[];
  capabilityToModules: Record<Capability, string[]>;
}

const MANIFEST_URL = "https://raw.githubusercontent.com/mcbookshelf/bookshelf/master/data/manifest.json";

function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function inferCapabilities(mod: RawManifestModule): Capability[] {
  const bag = `${mod.id} ${mod.name ?? ""} ${mod.description ?? ""} ${(mod.tags ?? []).join(" ")}`.toLowerCase();
  const caps: Capability[] = [];

  if (/(raycast|move|hitbox|vector|position|spline|projectile|collision)/.test(bag)) {
    caps.push("physics", "entity-control");
  }
  if (/(interaction|view|link|health|xp|sidebar|event|player|input)/.test(bag)) {
    caps.push("interaction", "ui-feedback", "entity-control");
  }
  if (/(generation|tree|biome|terrain|world)/.test(bag)) {
    caps.push("worldgen", "performance");
  }
  if (/(math|bitwise|string|time|color|compute|sin|cos|sqrt)/.test(bag)) {
    caps.push("math", "performance");
  }
  if (/(random|noise|rng|probab)/.test(bag)) {
    caps.push("random");
  }
  if (/(block|voxel|shape)/.test(bag)) {
    caps.push("block-ops");
  }
  if (/(log|dump|debug|trace|inspect)/.test(bag)) {
    caps.push("debug-observability");
  }
  if (/(runtime|optimized|fast|perf)/.test(bag)) {
    caps.push("performance");
  }

  return uniq(caps);
}

export class CapabilityCatalogManager {
  private readonly docsDir: string;
  private readonly manifestCachePath: string;
  private readonly catalogCachePath: string;

  constructor(private readonly rootDir: string) {
    this.docsDir = path.join(rootDir, ".docs");
    this.manifestCachePath = path.join(this.docsDir, "bookshelf_manifest.json");
    this.catalogCachePath = path.join(this.docsDir, "capability_catalog.json");
  }

  private buildCatalogFromManifest(manifest: RawManifest): CapabilityCatalog {
    const modules = (manifest.modules ?? []).map((mod) => ({
      id: mod.id,
      name: mod.name ?? mod.id,
      description: mod.description ?? "",
      tags: mod.tags ?? [],
      documentation: mod.documentation,
      dependencies: mod.dependencies ?? [],
      weakDependencies: mod.weak_dependencies ?? [],
      capabilities: inferCapabilities(mod),
    }));

    const capabilityToModules = Object.fromEntries(
      CAPABILITIES.map((cap) => [cap, [] as string[]])
    ) as Record<Capability, string[]>;

    for (const mod of modules) {
      for (const cap of mod.capabilities) {
        capabilityToModules[cap].push(mod.id);
      }
    }

    for (const cap of CAPABILITIES) {
      capabilityToModules[cap] = uniq(capabilityToModules[cap]).sort();
    }

    return {
      version: "bookshelf-master-data-manifest",
      source: {
        manifestUrl: MANIFEST_URL,
        generatedAt: new Date().toISOString(),
      },
      modules,
      capabilityToModules,
    };
  }

  private buildFallbackCatalogFromLegacy(legacy: { modules?: string[] }): CapabilityCatalog {
    const modules = (legacy.modules ?? []).map((id) => ({
      id,
      name: id,
      description: "",
      tags: [],
      dependencies: [],
      weakDependencies: [],
      capabilities: inferCapabilities({ id }),
    }));

    const capabilityToModules = Object.fromEntries(
      CAPABILITIES.map((cap) => [cap, [] as string[]])
    ) as Record<Capability, string[]>;

    for (const mod of modules) {
      for (const cap of mod.capabilities) {
        capabilityToModules[cap].push(mod.id);
      }
    }

    for (const cap of CAPABILITIES) {
      capabilityToModules[cap] = uniq(capabilityToModules[cap]).sort();
    }

    return {
      version: "fallback-legacy-bookshelf-json",
      source: {
        manifestUrl: "local:.docs/bookshelf.json",
        generatedAt: new Date().toISOString(),
      },
      modules,
      capabilityToModules,
    };
  }

  async refreshFromRemoteManifest(): Promise<CapabilityCatalog> {
    await fs.ensureDir(this.docsDir);
    const { data } = await axios.get<RawManifest>(MANIFEST_URL, { timeout: 15000 });
    const catalog = this.buildCatalogFromManifest(data);
    await fs.writeJson(this.manifestCachePath, data, { spaces: 2 });
    await fs.writeJson(this.catalogCachePath, catalog, { spaces: 2 });
    return catalog;
  }

  async getCatalog(): Promise<CapabilityCatalog> {
    await fs.ensureDir(this.docsDir);

    if (await fs.pathExists(this.catalogCachePath)) {
      return (await fs.readJson(this.catalogCachePath)) as CapabilityCatalog;
    }

    if (await fs.pathExists(this.manifestCachePath)) {
      const manifest = (await fs.readJson(this.manifestCachePath)) as RawManifest;
      const catalog = this.buildCatalogFromManifest(manifest);
      await fs.writeJson(this.catalogCachePath, catalog, { spaces: 2 });
      return catalog;
    }

    const legacyPath = path.join(this.docsDir, "bookshelf.json");
    if (await fs.pathExists(legacyPath)) {
      const legacy = (await fs.readJson(legacyPath)) as { modules?: string[] };
      const catalog = this.buildFallbackCatalogFromLegacy(legacy);
      await fs.writeJson(this.catalogCachePath, catalog, { spaces: 2 });
      return catalog;
    }

    const emptyCatalog: CapabilityCatalog = {
      version: "empty",
      source: {
        manifestUrl: MANIFEST_URL,
        generatedAt: new Date().toISOString(),
      },
      modules: [],
      capabilityToModules: Object.fromEntries(
        CAPABILITIES.map((cap) => [cap, [] as string[]])
      ) as Record<Capability, string[]>,
    };
    await fs.writeJson(this.catalogCachePath, emptyCatalog, { spaces: 2 });
    return emptyCatalog;
  }

  async lookupByCapabilities(requestedCapabilities: Capability[]) {
    const catalog = await this.getCatalog();
    const capabilityMatches = Object.fromEntries(
      requestedCapabilities.map((cap) => [cap, catalog.capabilityToModules[cap] ?? []])
    ) as Record<Capability, string[]>;

    const moduleScores = new Map<string, number>();
    for (const cap of requestedCapabilities) {
      for (const moduleId of capabilityMatches[cap] ?? []) {
        moduleScores.set(moduleId, (moduleScores.get(moduleId) ?? 0) + 1);
      }
    }

    const recommendedModules = Array.from(moduleScores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([moduleId]) => moduleId);

    return {
      catalogVersion: catalog.version,
      requestedCapabilities,
      capabilityMatches,
      recommendedModules,
    };
  }
}
