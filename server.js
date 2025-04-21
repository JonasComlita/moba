const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

// Server-side game state
let gameState = {
    players: [
        { x: 50, y: 300, health: 100, team: 0, abilityCooldown: 0 },
        { x: 750, y: 300, health: 100, team: 1, abilityCooldown: 0 }
    ],
    minions: [],
    towers: [
        { x: 0, y: 300, health: 200, team: 0, range: 100, damage: 20 },
        { x: 800, y: 300, health: 200, team: 1, range: 100, damage: 20 }
    ],
    bases: [
        { x: 0, y: 300, health: 500, team: 0 },
        { x: 800, y: 300, health: 500, team: 1 }
    ],
    lastUpdate: Date.now()
};

// Anti-cheat: Track client behavior
let clientStats = new Map();

wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`New connection from ${ip}`);
    ws.playerId = clientStats.size; // Assign player ID
    ws.stats = { actions: 0, abilitiesUsed: 0, startTime: Date.now(), lastUpdate: 0 };
    clientStats.set(ws.playerId, ws.stats);

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        const now = Date.now();
        const stats = ws.stats;

        // Anti-cheat: Rate-limit updates
        if (now - stats.lastUpdate < 16) return; // Enforce 60 FPS
        stats.lastUpdate = now;
        stats.actions++;
        const elapsed = (now - stats.startTime) / 1000;
        if (stats.actions / elapsed > 10) {
            console.warn(`Suspicious activity from ${ws.playerId}: ${stats.actions / elapsed} actions/sec`);
            ws.close();
            return;
        }

        // Process inputs
        if (data.type === 'move') {
            const player = gameState.players[data.playerId];
            const speedLimit = 5;
            if (Math.abs(data.dx) <= 1 && Math.abs(data.dy) <= 1) {
                player.x += data.dx * speedLimit;
                player.y += data.dy * speedLimit;
                player.x = Math.max(0, Math.min(800, player.x));
                player.y = Math.max(0, Math.min(600, player.y));
            }
        } else if (data.type === 'ability') {
            stats.abilitiesUsed++;
            const player = gameState.players[data.playerId];
            const target = gameState.players[data.targetId];
            if (player.abilityCooldown === 0) {
                target.health -= 20;
                if (target.health < 0) target.health = 0;
                player.abilityCooldown = 300; // 5 seconds
            }
        } else if (data.type === 'stateHash') {
            // Anti-cheat: Validate client state
            const serverHash = computeServerStateHash(gameState);
            if (data.hash !== serverHash) {
                console.warn(`State mismatch for ${ws.playerId}`);
                ws.close();
            }
        }

        // Broadcast updated state
        broadcastGameState();
    });

    ws.on('close', () => {
        console.log(`Disconnected: ${ip}`);
        clientStats.delete(ws.playerId);
    });
});

// Compute server state hash (simplified)
function computeServerStateHash(state) {
    let hash = 0;
    for (const player of state.players) {
        hash += Math.round(player.x + player.y + player.health + player.abilityCooldown);
    }
    for (const minion of state.minions) {
        hash += Math.round(minion.x + minion.y + minion.health);
    }
    return hash;
}

// Broadcast game state to all clients
function broadcastGameState() {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'gameState', state: gameState }));
        }
    });
}

// Server game loop
setInterval(() => {
    // Update cooldowns
    gameState.players.forEach(player => {
        if (player.abilityCooldown > 0) player.abilityCooldown--;
    });

    // Spawn minions
    if (gameState.minions.length < 10) { // Limit for simplicity
        gameState.minions.push({ x: 50, y: 300, health: 50, team: 0 });
        gameState.minions.push({ x: 750, y: 300, health: 50, team: 1 });
    }

    // Update minions
    gameState.minions.forEach(minion => {
        if (minion.team === 0) minion.x += 1;
        else minion.x -= 1;
    });
    gameState.minions = gameState.minions.filter(m => m.health > 0 && m.x >= 0 && m.x <= 800);

    // Update towers
    gameState.towers.forEach(tower => {
        let minDist = tower.range;
        let targetId = -1;
        let targetType = -1;
        // Check players
        gameState.players.forEach((player, i) => {
            if (player.team !== tower.team) {
                const dx = player.x - tower.x;
                const dy = player.y - tower.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < minDist) {
                    minDist = dist;
                    targetId = i;
                    targetType = 0;
                }
            }
        });
        // Check minions
        gameState.minions.forEach((minion, i) => {
            if (minion.team !== tower.team) {
                const dx = minion.x - tower.x;
                const dy = minion.y - tower.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < minDist) {
                    minDist = dist;
                    targetId = i;
                    targetType = 1;
                }
            }
        });
        if (targetId !== -1) {
            if (targetType === 0) {
                gameState.players[targetId].health -= tower.damage;
                if (gameState.players[targetId].health < 0) gameState.players[targetId].health = 0;
            } else {
                gameState.minions[targetId].health -= tower.damage;
            }
        }
    });

    broadcastGameState();
}, 1000 / 60); // 60 FPS

console.log('Server running on ws://localhost:8080');