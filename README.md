# rolldown drops a polyfill when the call that pulls it in is an empty function

A package marks only its polyfill as side-effectful:

```json
{ "sideEffects": ["./src/polyfill/*.js"] }
```

`ensure.js` imports the polyfill and exports an empty function. `emitter.js` calls it, then reads what the polyfill set:

```js
// lib/src/ensure.js
import "./polyfill/index.js";
export function ensure() {}

// lib/src/emitter.js
import { ensure } from "./ensure.js";
ensure();
export const EventEmitter = globalThis.expo.EventEmitter;
```

rolldown sees that `ensure()` does nothing and drops the call. Then nothing uses `ensure.js`. It is side-effect-free, so rolldown drops it too, and with it the polyfill. `emitter.js` reads `globalThis.expo` before anything sets it.

This is the shape of `expo-modules-core` on web (`EventEmitter.ts`, `ensureNativeModulesAreInstalled.ts`, `polyfill/index.web.ts`).

## Run

```sh
npm install
node repro.mjs
```

`direct.js` imports `emitter.js` directly. `barrel.js` imports it through `lib/src/index.js`, a side-effect-free barrel that also imports the polyfill (as `expo-modules-core`'s `index.ts` does).

## Expected

Every line prints `OK   EventEmitter.name = EventEmitter`. webpack 5 and esbuild (with or without `minifySyntax`) keep the polyfill for both entries.

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

The `direct` case fails on every version. The wrapped `barrel` case passed on 1.0.0-rc.17 only because the barrel's own `import "./polyfill"` ran first. Since 1.2.1 that barrel is skipped too (rolldown#11079), so only the dropped `ensure()` path is left.

## Workaround

Mark the package's modules as side-effectful:

```js
treeshake: { moduleSideEffects: (id) => id.includes("/expo-modules-core/") || undefined }
```
