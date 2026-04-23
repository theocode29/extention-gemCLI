import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "fs-extra";
import { DatapackInitEngine } from "../DatapackInitEngine.js";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dp-init-test-"));
  try {
    await fn(dir);
  } finally {
    await fs.remove(dir);
  }
}

async function testVersionMatrix(): Promise<void> {
  await withTempDir(async (dir) => {
    const engine = new DatapackInitEngine(dir);

    assert.equal(engine.resolveVersionSpec("1.20.5").packFormat, 41);
    assert.equal(engine.resolveVersionSpec("1.21.0").packFormat, 48);
    assert.equal(engine.resolveVersionSpec("1.21.5").packFormat, 71);
    assert.equal(engine.resolveVersionSpec("1.21.6").packFormat, 80);
    assert.equal(engine.resolveVersionSpec("1.21.7").packFormat, 81);

    assert.equal(engine.resolveVersionSpec("1.21.0").supportsSingularFolders, true);
    assert.equal(engine.resolveVersionSpec("1.20.5").supportsSingularFolders, false);
    assert.equal(engine.resolveVersionSpec("1.21.5").supportsGameTests, true);
  });
}

async function testMinimalInit1205(): Promise<void> {
  await withTempDir(async (dir) => {
    const engine = new DatapackInitEngine(dir);
    const result = await engine.initProject({
      version: "1.20.5",
      namespace: "demo",
    });

    assert.equal(result.profile, "minimal");
    assert.equal(await fs.pathExists(path.join(dir, "data/demo/functions/load.mcfunction")), true);
    assert.equal(await fs.pathExists(path.join(dir, "data/demo/function/load.mcfunction")), false);

    const mcmeta = await fs.readJson(path.join(dir, "pack.mcmeta"));
    assert.equal(mcmeta.pack.pack_format, 41);
    assert.deepEqual(mcmeta.pack.supported_formats, [41]);

    assert.equal(await fs.pathExists(path.join(dir, "data/bone_msd")), false);
    const dataEntries = (await fs.pathExists(path.join(dir, "data"))) ? await fs.readdir(path.join(dir, "data")) : [];
    assert.equal(dataEntries.some((entry) => entry.startsWith("bs.")), false);
  });
}

async function testProfilesAndCapabilities(): Promise<void> {
  await withTempDir(async (dir) => {
    const engine = new DatapackInitEngine(dir);

    await engine.initProject({
      version: "1.21.5",
      namespace: "demo",
      profile: "tests",
    });

    assert.equal(await fs.pathExists(path.join(dir, "data/demo/test_instance")), true);
    assert.equal(await fs.pathExists(path.join(dir, "data/demo/test_environment")), true);
  });

  await withTempDir(async (dir) => {
    const engine = new DatapackInitEngine(dir);

    await engine.initProject({
      version: "1.21.6",
      namespace: "demo",
      profile: "full",
    });

    assert.equal(await fs.pathExists(path.join(dir, "data/demo/worldgen/biome")), true);
    assert.equal(await fs.pathExists(path.join(dir, "data/demo/enchantment")), true);
    assert.equal(await fs.pathExists(path.join(dir, "data/demo/jukebox_song")), true);
    assert.equal(await fs.pathExists(path.join(dir, "overlays")), true);
  });
}

async function main(): Promise<void> {
  await testVersionMatrix();
  await testMinimalInit1205();
  await testProfilesAndCapabilities();
  process.stdout.write("DatapackInitEngine tests passed.\n");
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
