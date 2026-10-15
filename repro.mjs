import { cp, rm } from "node:fs/promises";
import { basename, dirname } from "node:path";
import nodeResolve from "@rollup/plugin-node-resolve";
import * as esbuild from "esbuild";
import { rolldown, VERSION as rolldownVersion } from "rolldown";
import { rollup, VERSION as rollupVersion } from "rollup";
import webpack from "webpack";

const cwd = import.meta.dirname;
const only = process.argv.slice(2);
const entries = ["direct", "barrel"];
// `empty` uses `lib/` with no changes. For each other variant, the files in `variants/<name>/` replace the files at the same paths in `dist/<name>/`.
const variants = ["empty", "return", "literal", "fix-side-effects", "fix-import"];

const bundlers = {
  async rolldown(input, file) {
    const bundle = await rolldown({ input, cwd: dirname(input), logLevel: "silent" });
    await bundle.write({ file, format: "esm" });
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
      context: dirname(input),
      entry: input,
      output: { path: dirname(file), filename: basename(file), library: { type: "module" } },
      experiments: { outputModule: true },
    });
    const stats = await new Promise((resolve, reject) => compiler.run((error, stats) => (error ? reject(error) : resolve(stats))));
    await new Promise((resolve) => compiler.close(resolve));
    if (stats.hasErrors()) throw new Error(stats.toString("errors-only"));
  },
};

const columns = [
  { label: "rolldown", bundler: "rolldown" },
  { label: "rollup", bundler: "rollup" },
  { label: "esbuild", bundler: "esbuild", options: {} },
  { label: "esbuild minify", bundler: "esbuild", options: { minifySyntax: true } },
  { label: "webpack", bundler: "webpack" },
].filter((column) => only.length === 0 || only.includes(column.bundler));

const widths = [16, 6, ...columns.map((column) => column.label.length)];
const line = (cells) => cells.map((cell, i) => cell.padEnd(widths[i])).join("  ").trimEnd();

console.log(`rolldown ${rolldownVersion}, rollup ${rollupVersion}, esbuild ${esbuild.version}, webpack ${webpack.version}\n`);
console.log(line(["variant", "entry", ...columns.map((column) => column.label)]));
for (const variant of variants) {
  const dir = `${cwd}/dist/${variant}`;
  await rm(dir, { recursive: true, force: true });
  await cp(`${cwd}/lib`, `${dir}/lib`, { recursive: true });
  for (const entry of entries) await cp(`${cwd}/${entry}.js`, `${dir}/${entry}.js`);
  if (variant !== "empty") await cp(`${cwd}/variants/${variant}`, dir, { recursive: true });
  for (const entry of entries) {
    const results = [];
    for (const { label, bundler, options } of columns) {
      const file = `${dir}/out/${label.replace(" ", "-")}/${entry}.js`;
      await bundlers[bundler](`${dir}/${entry}.js`, file, options);
      delete globalThis.expo;
      try {
        await import(file);
        results.push("OK");
      } catch (error) {
        // With no polyfill, `globalThis.expo.EventEmitter` throws a TypeError: "Cannot read properties of undefined (reading 'EventEmitter')".
        // Throw errors of all other types.
        if (!(error instanceof TypeError)) throw error;
        results.push("FAIL");
      }
    }
    console.log(line([variant, entry, ...results]));
  }
}
