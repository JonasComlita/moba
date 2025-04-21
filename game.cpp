#include <emscripten.h>
#include <vector>
#include <cmath>
#include <algorithm>

// Define structures (simplified, as server handles most logic)
struct Player
{
    float x, y;
    int health;
    int team;
    int abilityCooldown;
};

struct Minion
{
    float x, y;
    int health;
    int team;
};

struct Tower
{
    float x, y;
    int health;
    int team;
};

struct Base
{
    float x, y;
    int health;
    int team;
};

// Global state for client-side rendering
std::vector<Player> players(2);
std::vector<Minion> minions;
std::vector<Tower> towers;
std::vector<Base> bases;
bool initialized = false;

// Functions exposed to JavaScript
extern "C"
{
    // Initialize rendering state
    EMSCRIPTEN_KEEPALIVE
    void initGame()
    {
        if (!initialized)
        {
            // Initial positions (will be updated by server)
            players[0] = {50, 300, 100, 0, 0};
            players[1] = {750, 300, 100, 1, 0};
            towers.push_back({0, 300, 200, 0});
            towers.push_back({800, 300, 200, 1});
            bases.push_back({0, 300, 500, 0});
            bases.push_back({800, 300, 500, 1});
            initialized = true;
        }
    }

    // Update player position for rendering (local prediction)
    EMSCRIPTEN_KEEPALIVE
    void predictPlayerPosition(int playerId, float dx, float dy)
    {
        players[playerId].x += dx * 5;
        players[playerId].y += dy * 5;
        if (players[playerId].x < 0)
            players[playerId].x = 0;
        if (players[playerId].x > 800)
            players[playerId].x = 800;
        if (players[playerId].y < 0)
            players[playerId].y = 0;
        if (players[playerId].y > 600)
            players[playerId].y = 600;
    }

    // Set player position from server (reconciliation)
    EMSCRIPTEN_KEEPALIVE
    void setPlayerPosition(int playerId, float x, float y)
    {
        players[playerId].x = x;
        players[playerId].y = y;
    }

    // Set player health from server
    EMSCRIPTEN_KEEPALIVE
    void setPlayerHealth(int playerId, int health)
    {
        players[playerId].health = health;
    }

    // Set ability cooldown from server
    EMSCRIPTEN_KEEPALIVE
    void setAbilityCooldown(int playerId, int cooldown)
    {
        players[playerId].abilityCooldown = cooldown;
    }

    // Update minion state from server
    EMSCRIPTEN_KEEPALIVE
    void setMinionState(int index, float x, float y, int health, int team)
    {
        while (minions.size() <= index)
            minions.push_back({0, 0, 0, 0});
        minions[index] = {x, y, health, team};
    }

    // Clear minions
    EMSCRIPTEN_KEEPALIVE
    void clearMinions(int count)
    {
        minions.resize(count);
    }

    // Update tower and base health from server
    EMSCRIPTEN_KEEPALIVE
    void setTowerHealth(int index, int health)
    {
        towers[index].health = health;
    }

    EMSCRIPTEN_KEEPALIVE
    void setBaseHealth(int index, int health)
    {
        bases[index].health = health;
    }

    // Anti-cheat: Compute state hash for validation
    EMSCRIPTEN_KEEPALIVE
    int computeStateHash()
    {
        int hash = 0;
        for (const auto &player : players)
        {
            hash += static_cast<int>(player.x + player.y + player.health + player.abilityCooldown);
        }
        for (const auto &minion : minions)
        {
            hash += static_cast<int>(minion.x + minion.y + minion.health);
        }
        return hash;
    }

    // Anti-cheat: Memory integrity check
    EMSCRIPTEN_KEEPALIVE
    bool checkMemoryIntegrity()
    {
        for (const auto &player : players)
        {
            if (player.health < 0 || player.health > 100 || player.abilityCooldown < 0)
                return false;
        }
        return true;
    }

    // Getters for rendering
    EMSCRIPTEN_KEEPALIVE float getPlayerX(int playerId) { return players[playerId].x; }
    EMSCRIPTEN_KEEPALIVE float getPlayerY(int playerId) { return players[playerId].y; }
    EMSCRIPTEN_KEEPALIVE int getPlayerHealth(int playerId) { return players[playerId].health; }
    EMSCRIPTEN_KEEPALIVE int getAbilityCooldown(int playerId) { return players[playerId].abilityCooldown; }
    EMSCRIPTEN_KEEPALIVE int getMinionCount() { return minions.size(); }
    EMSCRIPTEN_KEEPALIVE float getMinionX(int index) { return minions[index].x; }
    EMSCRIPTEN_KEEPALIVE float getMinionY(int index) { return minions[index].y; }
    EMSCRIPTEN_KEEPALIVE int getTowerHealth(int index) { return towers[index].health; }
    EMSCRIPTEN_KEEPALIVE float getTowerX(int index) { return towers[index].x; }
    EMSCRIPTEN_KEEPALIVE float getTowerY(int index) { return towers[index].y; }
    EMSCRIPTEN_KEEPALIVE int getBaseHealth(int index) { return bases[index].health; }
    EMSCRIPTEN_KEEPALIVE float getBaseX(int index) { return bases[index].x; }
    EMSCRIPTEN_KEEPALIVE float getBaseY(int index) { return bases[index].y; }
}