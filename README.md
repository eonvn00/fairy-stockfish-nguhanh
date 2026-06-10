# Fairy-Stockfish Web AI Subset

This copy keeps only the source needed to build the Fairy-Stockfish engine core
and the JavaScript/WebAssembly binding target.

Kept:

- `src/`: C++ engine core, variant rules, search/evaluation, UCI support, and JS binding source.
- `src/Makefile`: native engine build.
- `src/Makefile_js`: Emscripten build for the JS/WASM binding, now outputting to `dist/`.
- `.github/workflows/build-nguhanh-wasm.yml`: CI build and smoke test for the Nguhanh WASM artifact.
- `Copying.txt`: GPL license text required when redistributing Fairy-Stockfish-based builds.
- `AUTHORS`: upstream attribution.

Removed:

- Regression/test suites.
- Python packaging and Python binding files.
- Original general-purpose project documentation.

Build examples:

```bash
cd src
make -j2 ARCH=x86-64 build
```

```bash
cd src
make -f Makefile_js build
```

The JS/WASM build writes output to `dist/`.

The Nguhanh CI artifact contains `stockfish.js`, `stockfish.wasm`, and
`stockfish.worker.js`; the worker exposes `bestMove` through the C++ engine
search, not a JavaScript fallback.
