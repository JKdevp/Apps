
const express = require('express');
const http = require('http');
const app = express();
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: { origin: '*' }
});

const rooms = {};

function addBots(roomId) {
  const room = rooms[roomId];
  const needed = 4 - room.players.length;
  for (let i = 1; i <= needed; i++) {
    const botId = `BOT_${i}`;
    if (!room.players.includes(botId)) {
      room.players.push(botId);
      room.positions[botId] = 0;
    }
  }
  console.log(`[Room ${roomId}] Bots added: ${room.players.join(', ')}`);
}

function botTurn(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  const player = room.players[room.turn];
  if (player.startsWith('BOT')) {
    const roll = Math.floor(Math.random() * 6) + 1;
    room.positions[player] = Math.min(room.positions[player] + roll, 19);
    io.to(roomId).emit('diceRolled', { player, value: roll });
    if (room.positions[player] >= 19) {
      io.to(roomId).emit('winner', player);
    } else {
      room.turn = (room.turn + 1) % room.players.length;
      io.to(roomId).emit('turnChange', room.turn);
      setTimeout(() => botTurn(roomId), 1000);
    }
  }
}

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  socket.on('createRoom', (roomId) => {
    console.log(`[Room ${roomId}] Creating new room`);
    socket.join(roomId);
    rooms[roomId] = { players: [socket.id], positions: {}, turn: 0 };
    rooms[roomId].positions[socket.id] = 0;

    addBots(roomId);
    io.to(roomId).emit('updateRoom', rooms[roomId]);
    io.to(roomId).emit('turnChange', 0);

    const firstPlayer = rooms[roomId].players[0];
    if (firstPlayer.startsWith('BOT')) {
      setTimeout(() => botTurn(roomId), 1000);
    }
  });

  socket.on('joinRoom', (roomId) => {
    if (rooms[roomId] && rooms[roomId].players.length < 4) {
      socket.join(roomId);
      rooms[roomId].players = rooms[roomId].players.filter(p => !p.startsWith('BOT'));
      rooms[roomId].players.push(socket.id);
      rooms[roomId].positions[socket.id] = 0;
      addBots(roomId);
      io.to(roomId).emit('updateRoom', rooms[roomId]);
      io.to(roomId).emit('turnChange', rooms[roomId].turn);
    }
  });

  socket.on('rollDice', (roomId) => {
    const room = rooms[roomId];
    if (!room) return;
    const currentPlayer = room.players[room.turn];
    if (socket.id !== currentPlayer) return;
    const roll = Math.floor(Math.random() * 6) + 1;
    room.positions[socket.id] = Math.min(room.positions[socket.id] + roll, 19);
    io.to(roomId).emit('diceRolled', { player: socket.id, value: roll });
    if (room.positions[socket.id] >= 19) {
      io.to(roomId).emit('winner', socket.id);
    } else {
      room.turn = (room.turn + 1) % room.players.length;
      io.to(roomId).emit('turnChange', room.turn);
      setTimeout(() => botTurn(roomId), 1000);
    }
  });

  socket.on('disconnecting', () => {
    for (const roomId of socket.rooms) {
      const room = rooms[roomId];
      if (room) {
        room.players = room.players.filter(p => p !== socket.id);
        delete room.positions[socket.id];
        if (room.players.length === 0) {
          delete rooms[roomId];
        } else {
          io.to(roomId).emit('updateRoom', room);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
