const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const RoomManager = require('./rooms');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;
const roomManager = new RoomManager();

// Middleware для логирования
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Статические файлы
app.use(express.static('../client'));

// Маршруты
app.get('/', (req, res) => {
    res.sendFile('index.html', { root: '../client' });
});

// Обработка Socket.io соединений
io.on('connection', (socket) => {
    console.log(`Новое соединение: ${socket.id}`);
    
    // Обработка установки имени пользователя
    socket.on('setUsername', (username) => {
        socket.username = username || `User-${socket.id.substring(0, 5)}`;
        updateUserCount();
    });
    
    // Поиск собеседника
    socket.on('findPartner', () => {
        if (socket.roomId) {
            socket.leave(socket.roomId);
            roomManager.leaveRoom(socket.roomId, socket.id);
        }
        
        const room = roomManager.findAvailableRoom();
        socket.join(room.id);
        socket.roomId = room.id;
        
        if (room.users.length === 1) {
            socket.emit('roomCreated', room.id);
        } else if (room.users.length === 2) {
            const partner = room.users.find(userId => userId !== socket.id);
            socket.emit('roomJoined', { roomId: room.id, partnerId: partner });
            socket.to(partner).emit('roomJoined', { roomId: room.id, partnerId: socket.id });
        } else {
            socket.emit('roomFull');
            socket.leave(room.id);
            socket.emit('findPartner');
        }
    });
    
    // Обработка WebRTC сигналов
    socket.on('offer', ({ offer, to }) => {
        socket.to(to).emit('offer', offer);
    });
    
    socket.on('answer', ({ answer, to }) => {
        socket.to(to).emit('answer', answer);
    });
    
    socket.on('iceCandidate', ({ candidate, to }) => {
        socket.to(to).emit('iceCandidate', candidate);
    });
    
    // Обработка сообщений чата
    socket.on('message', ({ to, message }) => {
        socket.to(to).emit('message', message);
    });
    
    // Отключение пользователя
    socket.on('disconnect', () => {
        console.log(`Пользователь отключен: ${socket.id}`);
        
        if (socket.roomId) {
            const room = roomManager.getRoom(socket.roomId);
            if (room) {
                const partner = room.users.find(userId => userId !== socket.id);
                if (partner) {
                    socket.to(partner).emit('partnerDisconnected');
                }
                roomManager.leaveRoom(socket.roomId, socket.id);
            }
        }
        
        updateUserCount();
    });
    
    function updateUserCount() {
        io.emit('userCount', io.engine.clientsCount);
    }
});

// Запуск сервера
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});