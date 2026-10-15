import { rm } from "node:fs/promises";
import { basename, dirname } from "node:path";
import nodeResolve from "@rollup/plugin-node-resolve";
import * as esbuild from "esbuild";
import { rolldown, VERSION as rolldownVersion } from "rolldown";
import { rollup, VERSION as rollupVersion } from "rollup";
import webpack from "webpack";

const cwd = import.meta.dirname;
const only = process.argv.slice(2);
const entries = ["direct", "barrel"];

const bundlers = {
  async rolldown(input, file, options) {
    const bundle = await rolldown({ input, cwd, logLevel: "silent" });
    await bundle.write({ file, format: "esm", ...options });
    await bundle.close();
  },
  async rollup(input, file) {
    const bundle = await rollup({ input, plugins: [nodeResolve()], onwarn() {} });
    await bundle.write({ file, format: "esm" });
    await bundle.close();
  },
  async esbuild(input, file, options) {
    await esbuild.build({ entryPoints: [input], outfile: file, bundle: true, format: "esm", logLevel: "silent", ...options });
  },
  async webpack(input, file) {
    const compiler = webpack({
      mode: "production",
      context: cwd,
      entry: input,
      output: { path: dirname(file), filename: basename(file), library: { type: "module" } },
      experiments: { outputModule: true },
    });
    const stats = await new Promise((resolve, reject) => compiler.run((error, stats) => (error ? reject(error) : resolve(stats))));
    await new Promise((resolve) => compiler.close(resolve));
    if (stats.hasErrors()) throw new Error(stats.toString("errors-only"));
  },
};

const cases = [
  { bundler: "rolldown", version: rolldownVersion, mode: "default", options: {} },
  { bundler: "rolldown", version: rolldownVersion, mode: "strictExecutionOrder", options: { strictExecutionOrder: true } },
  { bundler: "rollup", version: rollupVersion, mode: "default" },
  { bundler: "esbuild", version: esbuild.version, mode: "default", options: {} },
  { bundler: "esbuild", version: esbuild.version, mode: "minifySyntax", options: { minifySyntax: true } },
  { bundler: "webpack", version: webpack.version, mode: "production" },
];

for (const { bundler, version, mode, options } of cases) {
  if (only.length > 0 && !only.includes(bundler)) continue;
  for (const entry of entries) {
    const dir = `${cwd}/dist/${bundler}/${entry}-${mode}`;
    await rm(dir, { recursive: true, force: true });
    await bundlers[bundler](`${cwd}/${entry}.js`, `${dir}/${entry}.js`, options);
    delete globalThis.expo;
    let result;
    try {
      const { name } = await import(`${dir}/${entry}.js`);
      result = `OK   EventEmitter.name = ${name}`;
    } catch (error) {
      result = `FAIL ${error.message}`;
    }
    console.log(`${`${bundler} ${version}`.padEnd(16)} ${entry.padEnd(6)} ${mode.padEnd(20)} ${result}`);
  }
}
