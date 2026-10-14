import { rm } from "node:fs/promises";

const cwd = import.meta.dirname;
const packages = process.argv.slice(2);
const versions = packages.length > 0 ? packages : ["rolldown-rc17", "rolldown", "rolldown-latest"];
const entries = ["direct", "barrel"];
const modes = [
  { label: "default", output: {} },
  { label: "strictExecutionOrder", output: { strictExecutionOrder: true } },
];

for (const pkg of versions) {
  const { rolldown, VERSION } = await import(pkg);
  for (const entry of entries) {
    for (const mode of modes) {
      const dir = `${cwd}/dist/${VERSION}/${entry}-${mode.label}`;
      await rm(dir, { recursive: true, force: true });
      const bundle = await rolldown({ input: `${cwd}/${entry}.js`, cwd, logLevel: "silent" });
      await bundle.write({ dir, format: "esm", ...mode.output });
      await bundle.close();
      delete globalThis.expo;
      let result;
      try {
        const { name } = await import(`${dir}/${entry}.js`);
        result = `OK   EventEmitter.name = ${name}`;
      } catch (error) {
        result = `FAIL ${error.message}`;
      }
      console.log(`rolldown ${VERSION.padEnd(12)} ${entry.padEnd(6)} ${mode.label.padEnd(20)} ${result}`);
    }
  }
}
