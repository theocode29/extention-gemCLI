import fs from "fs-extra";
import path from "path";
import FlexSearch from "flexsearch";
import { glob } from "glob";
export class DocSearchEngine {
    index;
    docs = [];
    docsDir;
    constructor(rootDir) {
        this.docsDir = path.join(rootDir, ".docs");
        // FlexSearch is a high-performance full-text search engine
        // @ts-ignore
        this.index = new FlexSearch.Document({
            document: {
                id: "id",
                index: ["title", "content"],
                store: true,
            },
            tokenize: "forward",
        });
    }
    async init() {
        if (!(await fs.pathExists(this.docsDir))) {
            await fs.ensureDir(this.docsDir);
            console.error(`Created documentation directory at ${this.docsDir}`);
        }
        try {
            // On cherche tous les fichiers JSON dans .docs/ (en excluant les métadonnées Apple)
            const files = await glob("*.json", {
                cwd: this.docsDir,
                ignore: "._*"
            });
            this.docs = []; // Reset
            for (const file of files) {
                const fullPath = path.join(this.docsDir, file);
                const data = await fs.readJson(fullPath);
                // On gère les formats tableau (DocEntry[]) ou objet (Knowledge)
                if (Array.isArray(data)) {
                    this.docs = this.docs.concat(data);
                }
                else if (data.core_apis || data.readme_summary) {
                    // Format spécifique BONE:MSD / Bookshelf Ingest
                    const entries = [];
                    if (data.readme_summary) {
                        entries.push({
                            id: `${file}_readme`,
                            title: `Documentation - ${file}`,
                            content: data.readme_summary
                        });
                    }
                    if (data.core_apis && Array.isArray(data.core_apis)) {
                        data.core_apis.forEach((api, idx) => {
                            entries.push({
                                id: `${file}_api_${idx}`,
                                title: `API - ${api}`,
                                content: `Fonctionnalité disponible dans le namespace de la bibliothèque.`
                            });
                        });
                    }
                    this.docs = this.docs.concat(entries);
                }
            }
            // Ajout à l'index FlexSearch
            for (const doc of this.docs) {
                this.index.add(doc);
            }
            console.error(`DocSearchEngine initialized with ${this.docs.length} entries from ${files.length} sources.`);
        }
        catch (e) {
            console.error("Error initializing DocSearchEngine:", e);
        }
    }
    search(query) {
        const results = this.index.search(query, { enrich: true });
        const allMatches = new Set();
        for (const res of results) {
            for (const item of res.result) {
                allMatches.add(item.id);
            }
        }
        return Array.from(allMatches)
            .map((id) => this.docs.find((d) => d.id === id))
            .filter((d) => d !== undefined);
    }
}
