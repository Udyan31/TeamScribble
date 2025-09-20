const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Serve static files reliably from the "public" directory
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// In-memory storage for room data
const rooms = {}; // Structure: { roomId: { users: {}, pages: [], chat: [] } }
// users: { socketId: { nickname: '...', cursor: { x, y } } }

io.on('connection', (socket) => {
    // When a user joins a room
    socket.on('joinRoom', (data) => {
        const { roomId, nickname } = data;

        // Basic validation for room ID format
        if (!/^\d{4}$/.test(roomId) && roomId !== "NEW_PRIVATE_ROOM") {
             socket.emit('joinError', 'Room ID must be a 4-digit code.');
             return;
        }
        if (!nickname || nickname.trim() === "") {
            socket.emit('joinError', 'Nickname cannot be empty.');
            return;
        }

        socket.join(roomId);
        socket.roomId = roomId;
        socket.nickname = nickname;

        // If the room doesn't exist, create it with one default page and empty chat
        if (!rooms[roomId]) {
            rooms[roomId] = {
                users: {},
                pages: [{ drawingActions: [] }], // Start with one blank page
                chat: []
            };
        }

        // Add user to the room's user list
        rooms[roomId].users[socket.id] = { nickname: nickname, cursor: { x: 0, y: 0 } };

        // Send the entire room's current state to the new user
        socket.emit('roomState', {
            pages: rooms[roomId].pages,
            chat: rooms[roomId].chat,
            users: rooms[roomId].users // Send full user list for initial rendering
        });

        // Notify others in the room about the new user
        socket.to(roomId).emit('userJoined', {
            id: socket.id,
            nickname: nickname,
            cursor: { x: 0, y: 0 }
        });

        // Send updated user list to all existing users in the room
        io.in(roomId).emit('updateUserList', rooms[roomId].users);
    });

    // When a user finishes a drawing stroke/shape/fill
    socket.on('drawingAction', (data) => {
        const { roomId } = socket;
        if (rooms[roomId] && rooms[roomId].pages[data.pageId]) {
            // Fill actions should always be at the beginning for proper layering
            if (data.action.toolType === 'fill') {
                // Clear existing fill actions if a new one is applied
                rooms[roomId].pages[data.pageId].drawingActions = rooms[roomId].pages[data.pageId].drawingActions.filter(action => action.toolType !== 'fill');
                rooms[roomId].pages[data.pageId].drawingActions.unshift(data.action);
            } else {
                rooms[roomId].pages[data.pageId].drawingActions.push(data.action);
            }
            // Broadcast the drawing action to others in the same room
            socket.to(roomId).emit('drawingAction', data);
        }
    });

    // When a user adds a new page
    socket.on('addPage', () => {
        const { roomId } = socket;
        if (rooms[roomId]) {
            rooms[roomId].pages.push({ drawingActions: [] });
            // Send the full updated state to all clients to ensure sync
            io.in(roomId).emit('roomState', {
                pages: rooms[roomId].pages,
                chat: rooms[roomId].chat,
                users: rooms[roomId].users
            });
        }
    });

    // When a user deletes a page
    socket.on('deletePage', (data) => {
        const { roomId } = socket;
        const { pageId } = data;
        // Validation: room exists, page exists, and it's not the last page
        if (rooms[roomId] && rooms[roomId].pages[pageId] && rooms[roomId].pages.length > 1) {
            rooms[roomId].pages.splice(pageId, 1);
            io.in(roomId).emit('roomState', {
                pages: rooms[roomId].pages,
                chat: rooms[roomId].chat,
                users: rooms[roomId].users
            });
        }
    });

    // When a user performs an undo
    socket.on('undo', (data) => {
        const { roomId } = socket;
        const { pageId } = data;
        if (rooms[roomId] && rooms[roomId].pages[pageId] && rooms[roomId].pages[pageId].drawingActions.length > 0) {
            rooms[roomId].pages[pageId].drawingActions.pop(); // Remove the last action
            io.in(roomId).emit('roomState', { // Send full state to resync all clients
                pages: rooms[roomId].pages,
                chat: rooms[roomId].chat,
                users: rooms[roomId].users
            });
        }
    });

    // Handle clearing the current page
    socket.on('clearPage', (data) => {
        const { roomId } = socket;
        const { pageId } = data;
        if (rooms[roomId] && rooms[roomId].pages[pageId]) {
            rooms[roomId].pages[pageId].drawingActions = []; // Clear all actions
            io.in(roomId).emit('roomState', {
                pages: rooms[roomId].pages,
                chat: rooms[roomId].chat,
                users: rooms[roomId].users
            });
        }
    });

    // Handle chat messages
    socket.on('chatMessage', (message) => {
        const { roomId, nickname } = socket;
        if (rooms[roomId]) {
            const chatEntry = { nickname, message, timestamp: Date.now() };
            rooms[roomId].chat.push(chatEntry);
            // Broadcast the message to all in the room
            io.in(roomId).emit('newChatMessage', chatEntry);
        }
    });

    // Handle cursor movements
    socket.on('cursorMove', (data) => {
        const { roomId } = socket;
        if (rooms[roomId] && rooms[roomId].users[socket.id]) {
            rooms[roomId].users[socket.id].cursor = data;
            // Broadcast cursor position to others
            socket.to(roomId).emit('cursorUpdate', { id: socket.id, ...data });
        }
    });

    // When a user disconnects
    socket.on('disconnect', () => {
        const { roomId, nickname } = socket;
        if (roomId && rooms[roomId]) {
            // Remove user from the room's user list
            delete rooms[roomId].users[socket.id];

            // Notify others in the room about the user leaving
            io.in(roomId).emit('userLeft', socket.id);

            // If the room is empty, delete it from memory
            if (Object.keys(rooms[roomId].users).length === 0) {
                delete rooms[roomId];
            } else {
                // Otherwise, update the user list for remaining clients
                io.in(roomId).emit('updateUserList', rooms[roomId].users);
            }
        }
    });
});

server.listen(PORT, () => console.log(`Server is live and running on http://localhost:${PORT}`));