
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const rooms = {};

function createBot(id) {
  return {
    id,
    isBot: true,
    coins: 100,
    bet: 20,
    position: 0
  };
}

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('createRoom', (roomId) => {
    rooms[roomId] = {
      players: [{ id: socket.id, coins: 100, bet: 0, position: 0 }],
      turn: 0,
      started: false,
      pot: 0
    };
    socket.join(roomId);
    io.to(roomId).emit('updateRoom', rooms[roomId]);
  });

  socket.on('joinRoom', (roomId) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.players.length >= 4) return;
    room.players.push({ id: socket.id, coins: 100, bet: 0, position: 0 });
    socket.join(roomId);

    while (room.players.length < 4) {
      room.players.push(createBot(`BOT_${room.players.length}`));
    }

    room.started = true;
    io.to(roomId).emit('updateRoom', room);
    io.to(roomId).emit('betPhase', room.players.map(p => ({ id: p.id, coins: p.coins })));
  });

  socket.on('placeBet', ({ roomId, amount }) => {
    const room = rooms[roomId];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.coins < amount) return;

    player.bet = amount;
    player.coins -= amount;

    const allBetsPlaced = room.players.every(p => p.bet > 0);
    if (allBetsPlaced) {
      room.pot = room.players.reduce((sum, p) => sum + p.bet, 0);
      io.to(roomId).emit('startGame', room);
    }

    io.to(roomId).emit('updateRoom', room);
  });

  socket.on('rollDice', (roomId) => {
    const room = rooms[roomId];
    if (!room) return;

    const currentPlayer = room.players[room.turn];
    if (currentPlayer.id !== socket.id && !currentPlayer.isBot) return;

    const value = Math.floor(Math.random() * 6) + 1;
    currentPlayer.position += value;
    if (currentPlayer.position >= 24) {
      io.to(roomId).emit('winner', currentPlayer.id);
      return;
    }

    io.to(roomId).emit('diceRolled', { player: currentPlayer.id, value });
    room.turn = (room.turn + 1) % room.players.length;
    io.to(roomId).emit('updateRoom', room);
    io.to(roomId).emit('turnChange', room.turn);
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      room.players = room.players.filter(p => p.id !== socket.id);
      if (room.players.length === 0) {
        delete rooms[roomId];
      }
    }
  });
});

server.listen(3001, () => {
  console.log('🚀 Server running on port 3001');
});
