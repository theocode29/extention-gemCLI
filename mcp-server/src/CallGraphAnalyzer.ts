import fs from 'fs-extra';
import { glob } from 'glob';
import * as path from 'path';

export interface CallGraphNode {
    id: string;
    calls: string[];
    hasNBTWrite: boolean;
    hasVolatileMacro: boolean;
}

export class CallGraphAnalyzer {
    private nodes: Map<string, CallGraphNode> = new Map();

    constructor(private dataDir: string) {}

    public async scan(): Promise<void> {
        const pattern = path.join(this.dataDir, '**/*.mcfunction').replace(/\\/g, '/');
        const files = await glob(pattern);

        for (const file of files) {
            await this.parseFunction(file);
        }
    }

    private async parseFunction(filePath: string): Promise<void> {
        const content = await fs.readFile(filePath, 'utf-8');
        
        // Extract function ID from path: .../namespace/functions/path/to/func.mcfunction -> namespace:path/to/func
        const relativePath = path.relative(this.dataDir, filePath).replace(/\\/g, '/');
        const parts = relativePath.split('/');
        const functionsIndex = parts.indexOf('functions');
        
        if (functionsIndex === -1 || functionsIndex === 0) {
            return; // Not a standard function path
        }
        
        const namespace = parts[functionsIndex - 1];
        const functionPath = parts.slice(functionsIndex + 1).join('/').replace('.mcfunction', '');
        const id = `${namespace}:${functionPath}`;

        const node: CallGraphNode = {
            id,
            calls: [],
            hasNBTWrite: false,
            hasVolatileMacro: false
        };

        // Strip comments before analysis
        const noComments = content.replace(/^\s*#.*$/gm, '');

        const functionRegex = /\bfunction\s+([a-z0-9_.-]+:[a-z0-9/._-]+)/gm;
        const nbtWriteRegex = /\bdata\s+modify\s+entity\b/gm;
        const macroRegex = /\B\$\b/gm;

        let match;
        while ((match = functionRegex.exec(noComments)) !== null) {
            node.calls.push(match[1]);
        }

        if (nbtWriteRegex.test(noComments)) {
            node.hasNBTWrite = true;
        }

        if (macroRegex.test(noComments)) {
            node.hasVolatileMacro = true;
        }

        this.nodes.set(id, node);
    }

    public findCycles(): string[][] {
        const ids = Array.from(this.nodes.keys());
        const indexMap = new Map<string, number>();
        const lowLink = new Map<string, number>();
        const onStack = new Map<string, boolean>();
        const stack: string[] = [];
        const sccs: string[][] = [];
        let index = 0;

        const strongConnect = (v: string) => {
            indexMap.set(v, index);
            lowLink.set(v, index);
            index++;
            stack.push(v);
            onStack.set(v, true);

            const node = this.nodes.get(v);
            if (node) {
                for (const w of node.calls) {
                    if (!indexMap.has(w)) {
                        strongConnect(w);
                        lowLink.set(v, Math.min(lowLink.get(v)!, lowLink.get(w)!));
                    } else if (onStack.get(w)) {
                        lowLink.set(v, Math.min(lowLink.get(v)!, indexMap.get(w)!));
                    }
                }
            }

            if (lowLink.get(v) === indexMap.get(v)) {
                const scc: string[] = [];
                let w: string;
                do {
                    w = stack.pop()!;
                    onStack.set(w, false);
                    scc.push(w);
                } while (w !== v);
                
                // Only consider as cycle if SCC has more than 1 node 
                // OR if it's a single node calling itself
                if (scc.length > 1 || (scc.length === 1 && this.nodes.get(scc[0])?.calls.includes(scc[0]))) {
                    sccs.push(scc);
                }
            }
        };

        for (const id of ids) {
            if (!indexMap.has(id)) {
                strongConnect(id);
            }
        }

        return sccs;
    }

    public getNodes(): Map<string, CallGraphNode> {
        return this.nodes;
    }
}
