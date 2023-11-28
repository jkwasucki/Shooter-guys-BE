import cors from 'cors'
import express from 'express'
import {createServer} from 'node:http'
import { Namespace, Server, Socket } from 'socket.io'
import { v4 as uuidv4 } from 'uuid';


   
type Weapon = {
    x:number,
    y:number,
    angle:number,
    texture:string,
    id:string
}

type WeaponDrop = {
    x: number;
    y: number;
    texture: string;
    id: string;
}

type User = {
    x?: number,
    y?: number,
    weapon?:Weapon,
    cursors?:{},
    facing?:string,
    playerId:string
}

type Enemy = {
    x:number,
    y:number,
    id:string
}


class Room {
    players: Record<string, User> = {};
    private gameState = {
      enemies: [] as Enemy[],
      weapons: [] as WeaponDrop[],
    };
    freezer = [
        {}
    ]
    roomId
    passcode
    name
    autodestructionTimeout: NodeJS.Timeout | undefined;
    constructor(private namespace: Namespace, roomId:string, name:string, passcode:string) {
       
        this.roomId = roomId
        this.name = name
        this.passcode = passcode
        this.namespace = namespace
        this.autodestructionTimeout = undefined
        this.namespace.on('connection', (socket: Socket) => {
            console.log("SOCKET:", socket.id, "name:", name, "roomid;", roomId);

            this.handleConnection(socket);  // Pass the socket to handleConnection
        });
        
        
        //Initialized only once (once room gets created)
        // Spawn enemy and send data to clients
        setInterval(() => {
            if(this.gameState.enemies.length < 12){
                let north = {x: 2048, y: 4048}
                let south = {x: 2048, y: 48}
                let east = {x: 4048, y: 2048}
                let west = {x: 48, y: 2048}
            
                const spawns = [ north,south,east,west ]
                let index = Math.floor(Math.random() * 4)
                let spawn = spawns[index]
            
                const enemyData = {
                    x: spawn.x,
                    y: spawn.y,
                    id: uuidv4()
                } ;
            
                this.gameState.enemies.push(enemyData)
            
                this.namespace.emit('spawnEnemy', enemyData);
            }
        }, 6000);


        let spawnCount = 0

        setInterval(() => {
            if(Object.entries(this.players).length > 0 && spawnCount < 12){
                const weaponNames = ['weapon_pistol','weapon_rifle','weapon_shotgun']
                let weaponIndex = Math.floor(Math.random() * 3)

                
                let playerIndex = Math.floor(Math.random() * Object.entries(this.players).length)
                let [playerId, player] = Object.entries(this.players)[playerIndex];
                
                let spawn = getRandomPoint(player.x!,player.y!,1000);
                


                const weaponData = {
                    x: spawn.x,
                    y: spawn.y,
                    texture:weaponNames[weaponIndex],
                    id: uuidv4()
                };
                
                this.gameState.weapons.push(weaponData)

                this.namespace.emit('spawnWeapon', weaponData);
                spawnCount += 1
            }
            
        }, 15000);
    }
    private handleConnection(socket: Socket) {
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
          };
    
          //Stop AD timeout (if set)
          clearTimeout(this.autodestructionTimeout)

          socket.broadcast.emit('userJoined', 'User has joined');
          socket.broadcast.emit('newPlayer', this.players[socket.id]);
          socket.emit('setState', this.gameState);
        });

        socket.on('playerDead',(id)=>{
            socket.broadcast.emit('playerHasDied',(id))
        })

        socket.on('playerAlived',(id)=>{
            socket.broadcast.emit('playerRespawned',(id))
        })
        

        socket.on('updateEnemies',(enemy)=>{
            this.gameState.enemies.push(enemy)
            socket.broadcast.emit('spawnEnemy',(enemy))
        })
    
        socket.on('enemyMoving',(enemy:Enemy)=>{
            this.gameState.enemies.forEach((enemyState)=>{
                if(enemyState.id === enemy.id){
                    enemyState.x = enemy.x
                    enemyState.y = enemy.y
                }
                return true
            }) 
        })
    
    
        socket.on('playerMovement',(movement)=>{
           
            const {x,y,cursors} = movement
            this.players[socket.id].x = x
            this.players[socket.id].y = y
            this.players[socket.id].cursors = cursors
            
    
            socket.broadcast.emit('playerMoved',(this.players[socket.id]))
        })
        
    
        socket.on('updateCursors',(cursors,facing)=>{
            this.players[socket.id].cursors = cursors
            this.players[socket.id].facing = facing
    
           
            socket.broadcast.emit('updatedCursors',this.players[socket.id])
        })
    
        socket.on('newWeapon',(texture,id)=>{
            this.players[socket.id].weapon!.texture = texture
            this.players[socket.id].weapon!.id = id
    
            socket.broadcast.emit('pickupWeapon',this.players[socket.id])
        })
    
        socket.on('weaponRotation',(weaponAngle)=>{
            if( this.players[socket.id].weapon){
                this.players[socket.id].weapon!.angle = weaponAngle
                socket.broadcast.emit('weaponRotated',this.players[socket.id])
            }
        })
    
        socket.on('getGameState',()=>{
            socket.emit('recieveGameState',{...this.gameState,players:Object.values(this.players)})
        })
    
        socket.on('enemyKilled',(enemyId)=>{
            this.gameState.enemies = this.gameState.enemies.filter((enemyState)=>enemyState.id !== enemyId)
         })
     
         socket.on('weaponPicked',(weaponId)=>{
            this.gameState.weapons = this. gameState.weapons.filter((weaponState)=>weaponState.id !== weaponId)
         })
        socket.on('disconnect', () => {
            if(this.players.hasOwnProperty(socket.id)){
                delete this.players[socket.id]
            }

            //Check if there are still players in the room
            if(Object.keys(this.players).length === 0){
                this.autodestructionTimeout = setTimeout(()=>{
                    delete rooms[this.roomId];
                    console.log(`Room ${this.roomId} destroyed due to inactivity.`); 
                },120000)
            }

            socket.broadcast.emit('userLeft',{text:'User has left the game',userId:socket.id})
        });
    }
}




const app = express();
app.use(cors());
export const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket'],
  maxHttpBufferSize: 1e8,
  pingTimeout: 60000,
});

const rooms: Record<string, Room> = {};

io.on('connection',(socket:Socket)=>{
    
    socket.emit('namespace',(socket.nsp.name))


    socket.on('createGame', (name, passcode) => {
        const roomId = uuidv4();
        const room = new Room(io.of(roomId), roomId, name, passcode);
        rooms[roomId] = room;

        // Inform the client that the game is created
        // so he can reconnect to a proper namespace (room)
        socket.emit('gameCreated', roomId);

    });

    socket.on('joinGame', (name?, passcode?,roomId?) => {
        let room
        // Find the room based on name and passcode
        if(name && passcode){
            room = Object.values(rooms).find(
                (r) => r.passcode === passcode && r.name === name
              );
        //In case of a reconnect attempt
        }else if(roomId){
            room = Object.keys(rooms).find(
                (r) => r === roomId
            )
        }
        if (room instanceof Room) {
            socket.emit('roomFound',room.roomId)
        }else if(room as string){
            socket.emit('roomFound',room)
        }else {
            
            socket.emit('roomNotFound');
        }
        
      });
})



try {
  server.listen(4000, () => {
    console.log('Server running on port 4000');
  });
} catch (error) {
  console.log('[Server error]:', error);
}

    
function getRandomPoint(startX:number, startY:number, maxDistance:number) {
    // Generate random angles in radians
    var angle = Math.random() * 2 * Math.PI;
    
    // Generate a random distance within the specified range
    var distance = Math.random() * maxDistance;
    
    // Calculate the new coordinates
    var newX = startX + distance * Math.cos(angle);
    var newY = startY + distance * Math.sin(angle);
    
    return { x: newX, y: newY };
}
      