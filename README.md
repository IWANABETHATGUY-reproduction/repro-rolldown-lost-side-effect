# Why rolldown removes the polyfill, and why it is not a bug

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

rolldown makes these decisions:

1. `ensure()` is empty, so rolldown removes the call `ensure();`.
2. After that, no code uses the exports of `ensure.js`.
3. The `sideEffects` field in `lib/package.json` does not list `ensure.js`, so `ensure.js` is side-effect-free. A bundler can remove a side-effect-free module when no code uses its exports.
4. rolldown removes `ensure.js`. No other module in the bundle imports the polyfill, so rolldown removes the polyfill too.
5. `emitter.js` reads `globalThis.expo`, but no code in the bundle sets it. Thus the bundle throws a `TypeError`.

`expo-modules-core` has the same structure on web:

| This repo | `expo-modules-core` |
|---|---|
| `lib/src/emitter.js` | `EventEmitter.ts` |
| `lib/src/ensure.js` | `ensureNativeModulesAreInstalled.ts` |
| `lib/src/polyfill/index.js` | `polyfill/index.web.ts` |
| `lib/src/index.js` | `index.ts` |

## Root cause

The `sideEffects` field does not list `ensure.js`. But the only purpose of `ensure.js` is to load the polyfill, and that is a side effect. Thus the `sideEffects` field of the library is wrong. The bundlers are correct.

## Run

```sh
pnpm install
node repro.mjs            # run all bundlers
node repro.mjs rolldown   # run only rolldown
```

The repro has two entries:

- `direct.js` imports `emitter.js` directly.
- `barrel.js` imports `emitter.js` through `lib/src/index.js`. `lib/src/index.js` is a barrel file: a module that collects the exports of other modules. It is side-effect-free, and it also imports the polyfill.

For each variant, `repro.mjs` copies `lib/`, `direct.js` and `barrel.js` into `dist/<variant>/`. Then the files in `variants/<variant>/` replace the files at the same paths.

| Variant | Change to `lib/` |
|---|---|
| `empty` | No change. |
| `return` | `ensure()` returns `100`. |
| `literal` | `ensure.js` has `export const ensure = 1000;`. `emitter.js` has `ensure;` instead of `ensure();`. |
| `fix-side-effects` | The `sideEffects` field also lists `./src/ensure.js`. |
| `fix-import` | `emitter.js` also imports the polyfill directly. |

## Result

```
rolldown 1.2.14, rollup 4.64.6, esbuild 0.28.2, webpack 5.111.1

variant           entry   rolldown  rollup  esbuild  esbuild minify  webpack
empty             direct  FAIL      FAIL    OK       FAIL            OK
empty             barrel  FAIL      FAIL    OK       OK              OK
return            direct  OK        FAIL    OK       OK              OK
return            barrel  OK        FAIL    OK       OK              OK
literal           direct  FAIL      FAIL    FAIL     FAIL            FAIL
literal           barrel  FAIL      FAIL    OK       OK              FAIL
fix-side-effects  direct  OK        OK      OK       OK              OK
fix-side-effects  barrel  OK        OK      OK       OK              OK
fix-import        direct  OK        OK      OK       OK              OK
fix-import        barrel  OK        OK      OK       OK              OK
```

- `OK` means that the bundle runs with no error.
- `FAIL` means that the bundle throws a `TypeError`: `Cannot read properties of undefined (reading 'EventEmitter')`.

| Column | Options |
|---|---|
| `rolldown` | Default options. |
| `rollup` | `@rollup/plugin-node-resolve`, which reads the `sideEffects` field. |
| `esbuild` | `bundle: true`. |
| `esbuild minify` | `bundle: true`, `minifySyntax: true`. |
| `webpack` | `mode: "production"`. |

## Why it is not a bug

All four bundlers use the same `sideEffects` rule:

1. If no code uses the exports of a side-effect-free module, the bundler removes that module.
2. The bundler also removes the modules that it imports, unless a module that the bundler keeps also imports them.

The bundlers are different on one question only: does the call `ensure();` use the export `ensure`?

- rolldown and esbuild with `minifySyntax` remove a call to an empty function. In `return`, the function is not empty, so they keep the call.
- rollup removes each call that has no side effect, if no code uses the return value. Thus rollup also removes the call in `return`.
- webpack and esbuild without `minifySyntax` do not examine function bodies. Thus, for them, the call `ensure();` uses the export `ensure`, so they keep `ensure.js` and the polyfill.

In `literal`, `ensure` is not a function, so no bundler has a function body to examine. For all bundlers, the statement `ensure;` does not use the export `ensure`. Thus webpack also removes the polyfill.

Thus webpack keeps the polyfill in `empty` only because it knows less about `ensure()`. When the `sideEffects` field is wrong, the result of a bundler depends on how much it knows about the code.

rolldown, rollup and webpack connect `barrel.js` directly to `emitter.js`, because `lib/src/index.js` is side-effect-free. Thus they also remove the `import "./polyfill/index.js"` statement in `index.js`. webpack shows this result only in `literal`, because in `empty` it keeps the polyfill through `ensure.js`. esbuild keeps the statement in `index.js`, but the `sideEffects` rule does not require this.

## Fix

Make one of these two changes in the library (`expo-modules-core`):

- Add `./src/ensureNativeModulesAreInstalled.ts` to the `sideEffects` field in `package.json`. The `fix-side-effects` variant tests this change. For `expo-modules-core` 57.0.23, the field becomes:

  ```json
  "sideEffects": ["*.fx.ts", "./src/polyfill/*.ts", "./src/ensureNativeModulesAreInstalled.ts"]
  ```

- Import the polyfill directly in `src/EventEmitter.ts`. The `fix-import` variant tests this change.

Both changes give `OK` in every bundler. Until a version of `expo-modules-core` has one of these changes, add this option to the rolldown options of your app:

```js
treeshake: { moduleSideEffects: (id) => id.includes("/expo-modules-core/") || undefined }
```
