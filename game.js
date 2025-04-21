(async () => {
    // Load WebAssembly module with integrity check
    const expectedHash = 'your-wasm-file-sha256-hash'; // Compute server-side
    const response = await fetch('game.wasm');
    const wasmBuffer = await response.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', wasmBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    if (hash !== expectedHash) {
        throw new Error('WASM file integrity check failed');
    }
    const wasmModule = await WebAssembly.instantiate(wasmBuffer, { env: {} });
    wasmModule.instance.exports.initGame();

    // Set up canvases
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const minimap = document.getElementById('minimap');
    const minimapCtx = minimap.getContext('2d');

    // Player IDs (assigned by server)
    const localPlayerId = 0; // Set dynamically after server connection
    const remotePlayerId = 1;

    // Connect to the server
    const socket = new WebSocket('ws://localhost:8080');
    socket.onopen = () => console.log('Connected to server');

    // Load assets
    const mapImage = new Image(); mapImage.src = 'assets/map.avif';
    const championImage = new Image(); championImage.src = 'assets/champion.avif';
    const minionImage = new Image(); minionImage.src = 'assets/minion.avif';
    const towerImage = new Image(); towerImage.src = 'assets/tower.avif';
    const baseImage = new Image(); baseImage.src = 'assets/base.avif';
    const abilityIcon = new Image(); abilityIcon.src = 'assets/ability_icon.avif';
    const abilityAnimation = new Image(); abilityAnimation.src = 'assets/ability_anim.avif';

    // Load audio
    const audioContext = new AudioContext();
    let abilitySoundBuffer;
    fetch('assets/ability.opus')
        .then(response => response.arrayBuffer())
        .then(buffer => audioContext.decodeAudioData(buffer))
        .then(decodedData => abilitySoundBuffer = decodedData);

    function playAbilitySound() {
        if (abilitySoundBuffer) {
            const source = audioContext.createBufferSource();
            source.buffer = abilitySoundBuffer;
            source.connect(audioContext.destination);
            source.start();
        }
    }

    // Game loop
    function gameLoop() {
        // Anti-cheat: Check memory integrity
        if (!wasmModule.instance.exports.checkMemoryIntegrity()) {
            alert('Memory tampering detected!');
            socket.close();
            return;
        }

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw map
        if (mapImage.complete) ctx.drawImage(mapImage, 0, 0, canvas.width, canvas.height);

        // Draw bases
        for (let i = 0; i < 2; i++) {
            const x = wasmModule.instance.exports.getBaseX(i);
            const y = wasmModule.instance.exports.getBaseY(i);
            if (baseImage.complete) ctx.drawImage(baseImage, x - 40, y - 40, 80, 80);
        }

        // Draw towers
        for (let i = 0; i < 2; i++) {
            const x = wasmModule.instance.exports.getTowerX(i);
            const y = wasmModule.instance.exports.getTowerY(i);
            if (towerImage.complete) ctx.drawImage(towerImage, x - 32, y - 32, 64, 64);
        }

        // Draw minions
        for (let i = 0; i < wasmModule.instance.exports.getMinionCount(); i++) {
            const x = wasmModule.instance.exports.getMinionX(i);
            const y = wasmModule.instance.exports.getMinionY(i);
            if (minionImage.complete) ctx.drawImage(minionImage, x - 16, y - 16, 32, 32);
        }

        // Draw players
        for (let i = 0; i < 2; i++) {
            const x = wasmModule.instance.exports.getPlayerX(i);
            const y = wasmModule.instance.exports.getPlayerY(i);
            if (championImage.complete) ctx.drawImage(championImage, x - 24, y - 24, 48, 48);
            const health = wasmModule.instance.exports.getPlayerHealth(i);
            ctx.fillStyle = 'red';
            ctx.fillRect(x - 20, y - 30, 40, 5);
            ctx.fillStyle = 'green';
            ctx.fillRect(x - 20, y - 30, 40 * (health / 100.0), 5);
        }

        // Draw ability icon with cooldown
        const cooldown = wasmModule.instance.exports.getAbilityCooldown(localPlayerId);
        if (cooldown > 0) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(10, 50, 50, 50);
            ctx.fillStyle = 'white';
            ctx.font = '16px Arial';
            ctx.fillText(`${Math.ceil(cooldown / 60)}s`, 20, 60);
        }
        if (abilityIcon.complete) ctx.drawImage(abilityIcon, 10, 50, 50, 50);

        // Draw minimap
        minimapCtx.clearRect(0, 0, 100, 100);
        for (let i = 0; i < 2; i++) {
            const x = (wasmModule.instance.exports.getPlayerX(i) / 800) * 100;
            const y = (wasmModule.instance.exports.getPlayerY(i) / 600) * 100;
            minimapCtx.fillStyle = i === localPlayerId ? 'blue' : 'red';
            minimapCtx.fillRect(x - 2, y - 2, 4, 4);
        }
        for (let i = 0; i < wasmModule.instance.exports.getMinionCount(); i++) {
            const x = (wasmModule.instance.exports.getMinionX(i) / 800) * 100;
            const y = (wasmModule.instance.exports.getMinionY(i) / 600) * 100;
            minimapCtx.fillStyle = 'green';
            minimapCtx.fillRect(x - 1, y - 1, 2, 2);
        }

        // Check win condition
        if (wasmModule.instance.exports.getBaseHealth(0) <= 0) {
            alert('Team 1 wins!');
        } else if (wasmModule.instance.exports.getBaseHealth(1) <= 0) {
            alert('Team 0 wins!');
        }

        requestAnimationFrame(gameLoop);
    }

    // Start game loop
    gameLoop();

    // Handle server updates
    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'gameState') {
            const state = message.state;
            // Update players
            state.players.forEach((player, i) => {
                wasmModule.instance.exports.setPlayerPosition(i, player.x, player.y);
                wasmModule.instance.exports.setPlayerHealth(i, player.health);
                wasmModule.instance.exports.setAbilityCooldown(i, player.abilityCooldown);
            });
            // Update minions
            wasmModule.instance.exports.clearMinions(state.minions.length);
            state.minions.forEach((minion, i) => {
                wasmModule.instance.exports.setMinionState(i, minion.x, minion.y, minion.health, minion.team);
            });
            // Update towers and bases
            state.towers.forEach((tower, i) => {
                wasmModule.instance.exports.setTowerHealth(i, tower.health);
            });
            state.bases.forEach((base, i) => {
                wasmModule.instance.exports.setBaseHealth(i, base.health);
            });
        }
    };

    // Anti-cheat: Periodically send state hash to server
    setInterval(() => {
        const clientHash = wasmModule.instance.exports.computeStateHash();
        socket.send(JSON.stringify({ type: 'stateHash', hash: clientHash }));
    }, 5000);

    // Handle input with local prediction
    let movement = { dx: 0, dy: 0 };
    document.addEventListener('keydown', (event) => {
        switch (event.key) {
            case 'ArrowUp': movement.dy = -1; break;
            case 'ArrowDown': movement.dy = 1; break;
            case 'ArrowLeft': movement.dx = -1; break;
            case 'ArrowRight': movement.dx = 1; break;
            case 'q':
                socket.send(JSON.stringify({
                    type: 'ability',
                    playerId: localPlayerId,
                    targetId: remotePlayerId
                }));
                playAbilitySound();
                break;
        }
        if (movement.dx !== 0 || movement.dy !== 0) {
            // Local prediction
            wasmModule.instance.exports.predictPlayerPosition(localPlayerId, movement.dx, movement.dy);
            socket.send(JSON.stringify({
                type: 'move',
                playerId: localPlayerId,
                dx: movement.dx,
                dy: movement.dy
            }));
        }
    });

    document.addEventListener('keyup', (event) => {
        switch (event.key) {
            case 'ArrowUp':
            case 'ArrowDown': movement.dy = 0; break;
            case 'ArrowLeft':
            case 'ArrowRight': movement.dx = 0; break;
        }
        socket.send(JSON.stringify({
            type: 'move',
            playerId: localPlayerId,
            dx: movement.dx,
            dy: movement.dy
        }));
    });
})();