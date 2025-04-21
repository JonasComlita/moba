.
├── index.html          # Game interface
├── game.js             # JavaScript for game loop, rendering, and WebRTC
├── game.cpp            # C++ game logic (compiled to WASM)
├── assets
│   ├── map.avif        # Single-lane map background
│   ├── champion.avif   # Champion sprite
│   └── ability.opus    # Ability sound effect
├── server.js           # Node.js signaling server for WebRTC
└── package.json        # Node.js dependencies

Compile game.cpp to WebAssembly using Emscripten:
emcc game.cpp -o game.wasm -s EXPORTED_FUNCTIONS='["_initGame","_spawnMinions","_updateMinions","_updateTowers","_movePlayer","_useAbility","_updatePlayers","_getPlayerHealth","_getPlayerX","_getPlayerY","_getAbilityCooldown","_getMinionCount","_getMinionX","_getMinionY","_getTowerHealth","_getTowerX","_getTowerY","_getBaseHealth","_getBaseX","_getBaseY"]' -s EXPORTED_RUNTIME_METHODS='["cwrap"]'

