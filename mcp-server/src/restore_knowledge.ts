import { BONEEngine } from "./BONEEngine.js";
import { BookshelfEngine } from "./BookshelfEngine.js";
import { DocSearchEngine } from "./DocSearchEngine.js";
import path from "path";

import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// On remonte de 'src' à 'mcp-server' puis à la racine du projet
const rootDir = process.env.MCP_PROJECT_ROOT || path.resolve(__dirname, "../../");
const bone = new BONEEngine(rootDir);
const bs = new BookshelfEngine(rootDir);
const search = new DocSearchEngine(rootDir);

async function run() {
    console.log("🛠 Restoring Multi-Core Knowledge...");
    try {
        console.log("1/2 Ingesting BONE:MSD...");
        await bone.ingestTemplate();
        
        console.log("2/2 Ingesting Bookshelf...");
        await bs.ingest();
        
        console.log("Finalizing RAG...");
        await search.init();
        
        console.log("✅ Multi-Core Knowledge Restored.");
    } catch (e) {
        console.error("❌ Restoration failed:", e);
        process.exit(1);
    }
}

run();
