"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.server = void 0;
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const node_http_1 = require("node:http");
const socket_io_1 = require("socket.io");
const uuid_1 = require("uuid");
class Room {
    constructor(namespace, roomId, name, passcode) {
        this.namespace = namespace;
        this.players = {};
        this.gameState = {
            enemies: [],
            weapons: [],
        };
        this.freezer = [
            {}
        ];
        this.roomId = roomId;
        this.name = name;
        this.passcode = passcode;
        this.namespace = namespace;
        this.autodestructionTimeout = undefined;
        this.namespace.on('connection', (socket) => {
            console.log("SOCKET:", socket.id, "name:", name, "roomid;", roomId);
            this.handleConnection(socket); // Pass the socket to handleConnection
        });
        //Initialized only once (once room gets created)
        // Spawn enemy and send data to clients
        setInterval(() => {
            if (this.gameState.enemies.length < 12) {
                let north = { x: 2048, y: 4048 };
                let south = { x: 2048, y: 48 };
                let east = { x: 4048, y: 2048 };
                let west = { x: 48, y: 2048 };
                const spawns = [north, south, east, west];
                let index = Math.floor(Math.random() * 4);
                let spawn = spawns[index];
                const enemyData = {
                    x: spawn.x,
                    y: spawn.y,
                    id: (0, uuid_1.v4)()
                };
                this.gameState.enemies.push(enemyData);
                this.namespace.emit('spawnEnemy', enemyData);
            }
        }, 6000);
        let spawnCount = 0;
        setInterval(() => {
            if (Object.entries(this.players).length > 0 && spawnCount < 12) {
                const weaponNames = ['weapon_pistol', 'weapon_rifle', 'weapon_shotgun'];
                let weaponIndex = Math.floor(Math.random() * 3);
                let playerIndex = Math.floor(Math.random() * Object.entries(this.players).length);
                let [playerId, player] = Object.entries(this.players)[playerIndex];
                let spawn = getRandomPoint(player.x, player.y, 1000);
                const weaponData = {
                    x: spawn.x,
                    y: spawn.y,
                    texture: weaponNames[weaponIndex],
                    id: (0, uuid_1.v4)()
                };
                this.gameState.weapons.push(weaponData);
                this.namespace.emit('spawnWeapon', weaponData);
                spawnCount += 1;
            }
        }, 15000);
    }
    handleConnection(socket) {
        socket.on('join', () => {
            this.players[socket.id] = {
                playerId: socket.id,
                weapon: {
                    x: 0,
                    y: 0,
                    angle: 0,
                    texture: 'weapon_pistol',
                    id: '',
                },
                alive: true
            };
            //Stop AD timeout (if set)
            clearTimeout(this.autodestructionTimeout);
            console.log(this.players[socket.id]);
            socket.broadcast.emit('userJoined', 'User has joined');
            socket.broadcast.emit('newPlayer', this.players[socket.id]);
            socket.emit('setState', this.gameState);
        });
        socket.on('updateEnemies', (enemy) => {
            this.gameState.enemies.push(enemy);
            socket.broadcast.emit('spawnEnemy', (enemy));
        });
        socket.on('enemyMoving', (enemy) => {
            this.gameState.enemies.forEach((enemyState) => {
                if (enemyState.id === enemy.id) {
                    enemyState.x = enemy.x;
                    enemyState.y = enemy.y;
                }
                return true;
            });
        });
        socket.on('playerMovement', (movement) => {
            console.log(movement);
            const { x, y, cursors, alive } = movement;
            this.players[socket.id].x = x;
            this.players[socket.id].y = y;
            this.players[socket.id].cursors = cursors;
            this.players[socket.id].alive = alive;
            socket.broadcast.emit('playerMoved', (this.players[socket.id]));
        });
        socket.on('updateCursors', (cursors, facing) => {
            this.players[socket.id].cursors = cursors;
            this.players[socket.id].facing = facing;
            socket.broadcast.emit('updatedCursors', this.players[socket.id]);
        });
        socket.on('newWeapon', (texture, id) => {
            this.players[socket.id].weapon.texture = texture;
            this.players[socket.id].weapon.id = id;
            socket.broadcast.emit('pickupWeapon', this.players[socket.id]);
        });
        socket.on('weaponRotation', (weaponAngle) => {
            if (this.players[socket.id].weapon) {
                this.players[socket.id].weapon.angle = weaponAngle;
                socket.broadcast.emit('weaponRotated', this.players[socket.id]);
            }
        });
        socket.on('getGameState', () => {
            socket.emit('recieveGameState', { ...this.gameState, players: Object.values(this.players) });
        });
        socket.on('enemyKilled', (enemyId) => {
            this.gameState.enemies = this.gameState.enemies.filter((enemyState) => enemyState.id !== enemyId);
        });
        socket.on('weaponPicked', (weaponId) => {
            this.gameState.weapons = this.gameState.weapons.filter((weaponState) => weaponState.id !== weaponId);
        });
        socket.on('disconnect', () => {
            if (this.players.hasOwnProperty(socket.id)) {
                delete this.players[socket.id];
            }
            //Check if there are still players in the room
            if (Object.keys(this.players).length === 0) {
                this.autodestructionTimeout = setTimeout(() => {
                    delete rooms[this.roomId];
                    console.log(`Room ${this.roomId} destroyed due to inactivity.`);
                }, 120000);
            }
            socket.broadcast.emit('userLeft', { text: 'User has left the game', userId: socket.id });
        });
    }
}
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
exports.server = (0, node_http_1.createServer)(app);
const io = new socket_io_1.Server(exports.server, {
    cors: {
        origin: 'https://shooter-guys-fe.vercel.app',
        methods: ['GET', 'POST'],
        credentials: true,
    },
    transports: ['websocket'],
    maxHttpBufferSize: 1e8,
    pingTimeout: 60000,
});
const rooms = {};
io.on('connection', (socket) => {
    socket.emit('namespace', (socket.nsp.name));
    socket.on('createGame', (name, passcode) => {
        const roomId = (0, uuid_1.v4)();
        const room = new Room(io.of(roomId), roomId, name, passcode);
        rooms[roomId] = room;
        // Inform the client that the game is created
        // so he can reconnect to a proper namespace (room)
        socket.emit('gameCreated', roomId);
    });
    socket.on('joinGame', (name, passcode, roomId) => {
        let room;
        // Find the room based on name and passcode
        if (name && passcode) {
            room = Object.values(rooms).find((r) => r.passcode === passcode && r.name === name);
            //In case of a reconnect attempt
        }
        else if (roomId) {
            room = Object.keys(rooms).find((r) => r === roomId);
        }
        if (room instanceof Room) {
            socket.emit('roomFound', room.roomId);
        }
        else if (room) {
            socket.emit('roomFound', room);
        }
        else {
            socket.emit('roomNotFound');
        }
    });
});
app.get('/', (req, res) => {
    res.send('hello from the server');
});
try {
    exports.server.listen(4000, () => {
        console.log('Server running on port 4000');
    });
}
catch (error) {
    console.log('[Server error]:', error);
}
function getRandomPoint(startX, startY, maxDistance) {
    // Generate random angles in radians
    var angle = Math.random() * 2 * Math.PI;
    // Generate a random distance within the specified range
    var distance = Math.random() * maxDistance;
    // Calculate the new coordinates
    var newX = startX + distance * Math.cos(angle);
    var newY = startY + distance * Math.sin(angle);
    return { x: newX, y: newY };
}
