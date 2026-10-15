# rolldown drops a polyfill when the call that pulls it in is an empty function

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

## Run

```sh
npm install
node repro.mjs            # every bundler
node repro.mjs rolldown   # one bundler
```

- `direct.js`: imports `emitter.js` directly.
- `barrel.js`: through `lib/src/index.js`, a side-effect-free barrel that also imports the polyfill (as `expo-modules-core`'s `index.ts`).
- rollup reads `sideEffects` through `@rollup/plugin-node-resolve`.

## Expected

Every line `OK   EventEmitter.name = EventEmitter`.

## Actual

```
rolldown 1.2.14  direct default              FAIL Cannot read properties of undefined (reading 'EventEmitter')
rolldown 1.2.14  barrel default              FAIL Cannot read properties of undefined (reading 'EventEmitter')
rolldown 1.2.14  direct strictExecutionOrder FAIL Cannot read properties of undefined (reading 'EventEmitter')
rolldown 1.2.14  barrel strictExecutionOrder FAIL Cannot read properties of undefined (reading 'EventEmitter')
rollup 4.64.6    direct default              FAIL Cannot read properties of undefined (reading 'EventEmitter')
rollup 4.64.6    barrel default              FAIL Cannot read properties of undefined (reading 'EventEmitter')
esbuild 0.28.2   direct default              OK   EventEmitter.name = EventEmitter
esbuild 0.28.2   barrel default              OK   EventEmitter.name = EventEmitter
esbuild 0.28.2   direct minifySyntax         FAIL Cannot read properties of undefined (reading 'EventEmitter')
esbuild 0.28.2   barrel minifySyntax         OK   EventEmitter.name = EventEmitter
webpack 5.111.1  direct production           OK   EventEmitter.name = EventEmitter
webpack 5.111.1  barrel production           OK   EventEmitter.name = EventEmitter
```

- rolldown: fails on every line.
- `barrel` + `strictExecutionOrder`: passed on 1.0.0-rc.17 only because the barrel's own polyfill import ran first; skipped since 1.2.1 (rolldown#11079).
- rollup: same as rolldown.
- esbuild: `direct` + `minifySyntax` drops the empty call and the polyfill with it.
- webpack: keeps the polyfill.

## Workaround

```js
treeshake: { moduleSideEffects: (id) => id.includes("/expo-modules-core/") || undefined }
```
