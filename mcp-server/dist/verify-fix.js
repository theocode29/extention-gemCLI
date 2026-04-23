import { CallGraphAnalyzer } from './CallGraphAnalyzer.js';
import fs from 'fs-extra';
import * as path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
async function verify() {
    const testDir = path.join(__dirname, 'test_data');
    const funcFile = path.join(testDir, 'mynamespace/functions/sub/test.mcfunction');
    await fs.ensureDir(path.dirname(funcFile));
    await fs.writeFile(funcFile, `
# Comment with function hidden:call
execute as @a run function mynamespace:called_func
data modify entity @s Pos[0] set value 0.0
$say hi
    `);
    const analyzer = new CallGraphAnalyzer(testDir);
    await analyzer.scan();
    const nodes = analyzer.getNodes();
    console.log('Nodes found:', Array.from(nodes.keys()));
    const node = nodes.get('mynamespace:sub/test');
    if (!node) {
        console.error('FAIL: Node not found');
        // Cleanup
        await fs.remove(testDir);
        process.exit(1);
    }
    console.log('Node ID:', node.id);
    console.log('Calls:', node.calls);
    console.log('Has NBT Write:', node.hasNBTWrite);
    console.log('Has Volatile Macro:', node.hasVolatileMacro);
    const success = node.id === 'mynamespace:sub/test' &&
        node.calls.includes('mynamespace:called_func') &&
        !node.calls.includes('hidden:call') &&
        node.hasNBTWrite === true &&
        node.hasVolatileMacro === true;
    if (success) {
        console.log('VERIFICATION SUCCESS');
    }
    else {
        console.log('VERIFICATION FAILED');
        // Cleanup
        await fs.remove(testDir);
        process.exit(1);
    }
    // Cleanup
    await fs.remove(testDir);
}
verify();
