class RoomManager {
    constructor() {
        this.rooms = new Map();
        this.MAX_ROOM_SIZE = 2;
    }
    
    createRoom() {
        const roomId = this.generateRoomId();
        this.rooms.set(roomId, {
            id: roomId,
            users: [],
            createdAt: new Date()
        });
        return this.rooms.get(roomId);
    }
    
    findAvailableRoom() {
        // Ищем комнату с одним пользователем
        for (const [id, room] of this.rooms) {
            if (room.users.length === 1) {
                return room;
            }
        }
        
        // Если нет доступных комнат, создаем новую
        return this.createRoom();
    }
    
    getRoom(roomId) {
        return this.rooms.get(roomId);
    }
    
    leaveRoom(roomId, userId) {
        const room = this.rooms.get(roomId);
        if (!room) return;
        
        room.users = room.users.filter(id => id !== userId);
        
        // Если комната пустая, удаляем ее
        if (room.users.length === 0) {
            this.rooms.delete(roomId);
        }
    }
    
    generateRoomId() {
        return Math.random().toString(36).substring(2, 15) + 
               Math.random().toString(36).substring(2, 15);
    }
}

module.exports = RoomManager;