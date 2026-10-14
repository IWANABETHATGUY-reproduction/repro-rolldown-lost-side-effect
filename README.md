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

The `direct` case fails on every version. The `barrel` case with wrapped modules (`strictExecutionOrder`, or the `__esmMin` wrapping Vite's dependency optimizer produces) used to pass because the wrapped barrel's own `import "./polyfill"` ran first. Since 1.2.1 the wrapped barrel is skipped, as the unwrapped one always was (see rolldown#11079), so only the `ensure()` path is left, and it is dropped.

Bisect of the `barrel` + `strictExecutionOrder` case: passes on 1.0.0-rc.17 to 1.0.3, fails on 1.1.0 to 1.1.3 (`experimental.lazyBarrel` on by default, #9632), passes on 1.1.4 to 1.2.0 (#10071 turned it off), fails from 1.2.1 on.

## Workaround

Mark the package's modules as side-effectful:

```js
treeshake: { moduleSideEffects: (id) => id.includes("/expo-modules-core/") || undefined }
```
