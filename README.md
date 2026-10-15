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
node repro.mjs
```

- `direct.js`: imports `emitter.js` directly.
- `barrel.js`: through `lib/src/index.js`, a side-effect-free barrel that also imports the polyfill (as `expo-modules-core`'s `index.ts`).

## Expected

Every line `OK   EventEmitter.name = EventEmitter`. webpack 5 and esbuild (with or without `minifySyntax`) keep the polyfill.

## Actual

```
rolldown 1.0.0-rc.17  direct default              FAIL Cannot read properties of undefined (reading 'EventEmitter')
rolldown 1.0.0-rc.17  direct strictExecutionOrder FAIL Cannot read properties of undefined (reading 'EventEmitter')
rolldown 1.0.0-rc.17  barrel default              FAIL Cannot read properties of undefined (reading 'EventEmitter')
rolldown 1.0.0-rc.17  barrel strictExecutionOrder OK   EventEmitter.name = EventEmitter
rolldown 1.2.13       direct default              FAIL Cannot read properties of undefined (reading 'EventEmitter')
rolldown 1.2.13       direct strictExecutionOrder FAIL Cannot read properties of undefined (reading 'EventEmitter')
rolldown 1.2.13       barrel default              FAIL Cannot read properties of undefined (reading 'EventEmitter')
rolldown 1.2.13       barrel strictExecutionOrder FAIL Cannot read properties of undefined (reading 'EventEmitter')
rolldown 1.2.14       direct default              FAIL Cannot read properties of undefined (reading 'EventEmitter')
rolldown 1.2.14       direct strictExecutionOrder FAIL Cannot read properties of undefined (reading 'EventEmitter')
rolldown 1.2.14       barrel default              FAIL Cannot read properties of undefined (reading 'EventEmitter')
rolldown 1.2.14       barrel strictExecutionOrder FAIL Cannot read properties of undefined (reading 'EventEmitter')
```

- `direct`: fails on every version.
- `barrel` + `strictExecutionOrder`: passed on rc.17 only because the barrel's own polyfill import ran first; skipped since 1.2.1 (rolldown#11079).

## Workaround

```js
treeshake: { moduleSideEffects: (id) => id.includes("/expo-modules-core/") || undefined }
```
