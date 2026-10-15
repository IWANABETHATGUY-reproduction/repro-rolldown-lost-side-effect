# A polyfill dropped behind an empty-function call: not a rolldown bug

```js
// lib/package.json: { "sideEffects": ["./src/polyfill/*.js"] }

// lib/src/ensure.js
import "./polyfill/index.js";
export function ensure() {}

// lib/src/emitter.js
import { ensure } from "./ensure.js";
ensure();
export const EventEmitter = globalThis.expo.EventEmitter;
```

- `ensure()` is empty → call dropped.
- `ensure.js` now unused and side-effect-free → dropped, with the polyfill.
- `emitter.js` reads `globalThis.expo` before anything sets it.
- Same shape as `expo-modules-core` on web (`EventEmitter.ts` → `ensureNativeModulesAreInstalled.ts` → `polyfill/index.web.ts`).

## Root cause

`sideEffects` marks `ensure.js` as side-effect-free, but `ensure.js` exists only to load the polyfill. The library's `sideEffects` list is wrong, not the bundler.

## Run

```sh
pnpm install
node repro.mjs            # every bundler
node repro.mjs rolldown   # one bundler
```

Entries:

- `direct.js`: imports `emitter.js` directly.
- `barrel.js`: through `lib/src/index.js`, a side-effect-free barrel that also imports the polyfill (as `expo-modules-core`'s `index.ts`).

Variants (each one is a copy of `lib/` with the files in `variants/<name>/`):

- `empty`: `lib/` as is.
- `return`: `ensure()` returns `100`.
- `literal`: `export const ensure = 1000;`, and `emitter.js` has `ensure;` in place of `ensure();`.
- `fix-side-effects`: `./src/ensure.js` added to `sideEffects`.
- `fix-import`: `emitter.js` imports the polyfill directly.

## Result

```
rolldown 1.2.14, rollup 4.64.6, esbuild 0.28.2, webpack 5.111.1

variant           entry   rolldown  rolldown strict  rollup  esbuild  esbuild minify  webpack
empty             direct  FAIL      FAIL             FAIL    OK       FAIL            OK
empty             barrel  FAIL      FAIL             FAIL    OK       OK              OK
return            direct  OK        OK               FAIL    OK       OK              OK
return            barrel  OK        OK               FAIL    OK       OK              OK
literal           direct  FAIL      FAIL             FAIL    FAIL     FAIL            FAIL
literal           barrel  FAIL      FAIL             FAIL    OK       OK              FAIL
fix-side-effects  direct  OK        OK               OK      OK       OK              OK
fix-side-effects  barrel  OK        OK               OK      OK       OK              OK
fix-import        direct  OK        OK               OK      OK       OK              OK
fix-import        barrel  OK        OK               OK      OK       OK              OK
```

- `FAIL`: `Cannot read properties of undefined (reading 'EventEmitter')`.
- `rolldown strict`: `output.strictExecutionOrder: true`. `esbuild minify`: `minifySyntax: true`. `webpack`: `mode: "production"`.
- rollup reads `sideEffects` through `@rollup/plugin-node-resolve`.

## Why it is not a bug

- All four bundlers use the same `sideEffects` rule: a side-effect-free module with no used exports is dropped, and its imports go with it.
- They differ only on one question: does `ensure()` use `ensure`?
  - rolldown and esbuild `minifySyntax` drop a call to an empty function. In `return` the function is not empty, so they keep the call.
  - rollup drops any call that has no side effect and whose result is unused, so `return` does not help.
  - webpack and esbuild do not look into function bodies. They count the call as a use, so they keep `ensure.js` and the polyfill.
- `literal` has no function body to look into. No bundler counts `ensure;` as a use, so webpack drops the polyfill too.
- So webpack keeps the polyfill in `empty` only because it knows less about `ensure()`. With a wrong `sideEffects` list, the output depends on how much a bundler knows.
- `barrel`: rolldown, rollup and webpack skip the side-effect-free `index.js` and go straight to `emitter.js`, so the polyfill import in `index.js` goes too. webpack shows this only in `literal`. esbuild keeps it, but the `sideEffects` contract does not require that.
- `rolldown strict` matches `rolldown` in every row. `empty` + `barrel` passed on 1.0.0-rc.17 only because the barrel's own polyfill import ran first; skipped since 1.2.1 (rolldown#11079).

## Fix

In the library (`expo-modules-core`), one of:

- `fix-side-effects`: add `ensure.js` (`ensureNativeModulesAreInstalled`) to `sideEffects`.
- `fix-import`: import the polyfill in `emitter.js` (`EventEmitter.ts`) directly.

Until the library is fixed, in the app:

```js
treeshake: { moduleSideEffects: (id) => id.includes("/expo-modules-core/") || undefined }
```
