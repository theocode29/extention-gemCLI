import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';

async function fetchBookshelfManifest() {
    console.log('Fetching Bookshelf manifest from GitHub...');
    const url = 'https://raw.githubusercontent.com/mcbookshelf/bookshelf/main/meta/manifest.json';
    try {
        const { data: manifest } = await axios.get(url);
        const documents = [];
        for (const [id, module] of Object.entries(manifest.modules)) {
            const mod = module as any;
            documents.push({
                id: `bookshelf_${id}`,
                title: `Bookshelf: ${id}`,
                content: `Module: ${id}\nDescription: ${mod.description || 'No description'}\nUsage: ${mod.usage || 'No usage info'}`,
                url: `https://mcbookshelf.dev/modules/${id}/`
            });
        }
        return documents;
    } catch (e) {
        console.error('Error fetching Bookshelf manifest:', e);
        return [];
    }
}

async function fetchMCDocSymbols() {
    console.log('Fetching MCDoc symbols from GitHub...');
    const repo = 'SpyglassMC/vanilla-mcdoc';
    const apiUrl = `https://api.github.com/repos/${repo}/git/trees/main?recursive=1`;
    
    try {
        const { data: tree } = await axios.get(apiUrl);
        const mcdocFiles = tree.tree.filter((f: any) => f.path.endsWith('.mcdoc'));
        const documents = [];

        for (const file of mcdocFiles.slice(0, 100)) { // Increased to 100
            const rawUrl = `https://raw.githubusercontent.com/${repo}/main/${file.path}`;
            console.log(`  Fetching ${file.path}...`);
            const { data: content } = await axios.get(rawUrl);
            documents.push({
                id: `mcdoc_${file.path.replace(/\//g, '_')}`,
                title: `MCDoc: ${file.path}`,
                content: `Schema definition for ${file.path}:\n${content}`,
                url: `https://github.com/${repo}/blob/main/${file.path}`
            });
        }
        return documents;
    } catch (e) {
        console.error('Error fetching MCDoc:', e);
        return [];
    }
}

async function main() {
    const bookshelfDocs = await fetchBookshelfManifest();
    const mcdocDocs = await fetchMCDocSymbols();
    const finalIndex = [...bookshelfDocs, ...mcdocDocs];
    
    await fs.writeJson('docs_index.json', finalIndex, { spaces: 2 });
    console.log(`Done! Indexed ${finalIndex.length} documents.`);
}

main();
