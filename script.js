// Конфигурация
const config = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478?transport=udp" }
    ]
};

// Состояние приложения
const state = {
    socket: null,
    peerConnection: null,
    localStream: null,
    currentRoom: null,
    username: 'Гость',
    isMuted: false,
    isVideoOff: false,
    partnerId: null
};

// Инициализация приложения
document.addEventListener('DOMContentLoaded', async function() {
    // Получаем элементы DOM
    const elements = getDOMElements();
    
    // Показываем модальное окно для ввода имени
    showUsernameModal(elements);
    
    // Инициализируем Socket.io соединение
    initializeSocketConnection(elements);
    
    // Настройка обработчиков событий
    setupEventHandlers(elements);
    
    // Получаем доступ к медиаустройствам
    try {
        state.localStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
        });
        elements.localVideo.srcObject = state.localStream;
    } catch (err) {
        console.error("Ошибка доступа к медиаустройствам:", err);
        alert("Не удалось получить доступ к камере/микрофону. Пожалуйста, проверьте разрешения.");
    }
});

function getDOMElements() {
    return {
        usernameModal: document.getElementById('usernameModal'),
        usernameInput: document.getElementById('usernameInput'),
        saveUsernameBtn: document.getElementById('saveUsernameBtn'),
        usernameDisplay: document.getElementById('username'),
        startBtn: document.getElementById('startBtn'),
        nextBtn: document.getElementById('nextBtn'),
        muteBtn: document.getElementById('muteBtn'),
        videoBtn: document.getElementById('videoBtn'),
        endBtn: document.getElementById('endBtn'),
        messageInput: document.getElementById('messageInput'),
        sendBtn: document.getElementById('sendBtn'),
        chatMessages: document.getElementById('chatMessages'),
        searchingOverlay: document.getElementById('searchingOverlay'),
        onlineCount: document.getElementById('online'),
        localVideo: document.getElementById('localVideo'),
        remoteVideo: document.getElementById('remoteVideo')
    };
}

function showUsernameModal(elements) {
    elements.usernameModal.style.display = 'flex';
    
    elements.saveUsernameBtn.addEventListener('click', () => {
        const username = elements.usernameInput.value.trim();
        if (username) {
            state.username = username;
            elements.usernameDisplay.textContent = username;
            elements.usernameModal.style.display = 'none';
        } else {
            alert('Пожалуйста, введите ваше имя');
        }
    });
}

function initializeSocketConnection(elements) {
    state.socket = io();
    
    state.socket.on('connect', () => {
        console.log('Connected to server with ID:', state.socket.id);
        state.socket.emit('setUsername', state.username);
    });
    
    state.socket.on('userCount', count => {
        elements.onlineCount.textContent = count;
    });
    
    state.socket.on('roomCreated', roomId => {
        state.currentRoom = roomId;
        elements.searchingOverlay.style.display = 'flex';
    });
    
    state.socket.on('roomJoined', ({ roomId, partnerId }) => {
        state.currentRoom = roomId;
        state.partnerId = partnerId;
        elements.searchingOverlay.style.display = 'none';
        addSystemMessage(elements.chatMessages, 'Собеседник найден! Приятного общения!');
        createPeerConnection(elements);
    });
    
    state.socket.on('roomFull', () => {
        addSystemMessage(elements.chatMessages, 'Комната заполнена. Поиск новой комнаты...');
    });
    
    state.socket.on('partnerDisconnected', () => {
        addSystemMessage(elements.chatMessages, 'Собеседник покинул чат. Поиск нового...');
        resetConnection(elements);
        state.socket.emit('findPartner');
    });
    
    state.socket.on('offer', async (offer) => {
        if (!state.peerConnection) {
            createPeerConnection(elements);
        }
        
        try {
            await state.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await state.peerConnection.createAnswer();
            await state.peerConnection.setLocalDescription(answer);
            state.socket.emit('answer', { answer, to: state.partnerId });
        } catch (err) {
            console.error('Ошибка при обработке offer:', err);
        }
    });
    
    state.socket.on('answer', async (answer) => {
        try {
            await state.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
            console.error('Ошибка при обработке answer:', err);
        }
    });
    
    state.socket.on('iceCandidate', async (candidate) => {
        try {
            await state.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            console.error('Ошибка при добавлении ICE кандидата:', err);
        }
    });
    
    state.socket.on('message', (message) => {
        addMessage(elements.chatMessages, 'partner', message);
    });
}

function setupEventHandlers(elements) {
    // Начать поиск собеседника
    elements.startBtn.addEventListener('click', () => {
        elements.startBtn.disabled = true;
        elements.nextBtn.disabled = false;
        elements.muteBtn.disabled = false;
        elements.videoBtn.disabled = false;
        elements.endBtn.disabled = false;
        elements.messageInput.disabled = false;
        elements.sendBtn.disabled = false;
        
        state.socket.emit('findPartner');
    });
    
    // Следующий собеседник
    elements.nextBtn.addEventListener('click', () => {
        resetConnection(elements);
        state.socket.emit('findPartner');
        elements.searchingOverlay.style.display = 'flex';
        elements.chatMessages.innerHTML = '';
    });
    
    // Завершить разговор
    elements.endBtn.addEventListener('click', () => {
        resetConnection(elements);
        elements.startBtn.disabled = false;
        elements.nextBtn.disabled = true;
        elements.muteBtn.disabled = true;
        elements.videoBtn.disabled = true;
        elements.endBtn.disabled = true;
        elements.messageInput.disabled = true;
        elements.sendBtn.disabled = true;
        
        addSystemMessage(elements.chatMessages, 'Разговор завершен. Нажмите "Начать" для нового собеседника.');
    });
    
    // Управление микрофоном
    elements.muteBtn.addEventListener('click', () => {
        if (state.localStream) {
            state.isMuted = !state.isMuted;
            state.localStream.getAudioTracks().forEach(track => {
                track.enabled = !state.isMuted;
            });
            elements.muteBtn.innerHTML = state.isMuted 
                ? '<i class="fas fa-microphone-slash"></i>' 
                : '<i class="fas fa-microphone"></i>';
            elements.muteBtn.classList.toggle('danger', state.isMuted);
        }
    });
    
    // Управление камерой
    elements.videoBtn.addEventListener('click', () => {
        if (state.localStream) {
            state.isVideoOff = !state.isVideoOff;
            state.localStream.getVideoTracks().forEach(track => {
                track.enabled = !state.isVideoOff;
            });
            elements.videoBtn.innerHTML = state.isVideoOff 
                ? '<i class="fas fa-video-slash"></i>' 
                : '<i class="fas fa-video"></i>';
            elements.videoBtn.classList.toggle('danger', state.isVideoOff);
        }
    });
    
    // Отправка сообщения
    elements.sendBtn.addEventListener('click', sendMessage);
    elements.messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    
    function sendMessage() {
        const message = elements.messageInput.value.trim();
        if (message && state.partnerId) {
            state.socket.emit('message', { 
                to: state.partnerId, 
                message: message 
            });
            addMessage(elements.chatMessages, 'user', message);
            elements.messageInput.value = '';
        }
    }
}

function createPeerConnection(elements) {
    state.peerConnection = new RTCPeerConnection(config);
    
    // Добавляем локальный поток
    if (state.localStream) {
        state.localStream.getTracks().forEach(track => {
            state.peerConnection.addTrack(track, state.localStream);
        });
    }
    
    // Обработка ICE кандидатов
    state.peerConnection.onicecandidate = (event) => {
        if (event.candidate && state.partnerId) {
            state.socket.emit('iceCandidate', { 
                candidate: event.candidate, 
                to: state.partnerId 
            });
        }
    };
    
    // Получение удаленного потока
    state.peerConnection.ontrack = (event) => {
        elements.remoteVideo.srcObject = event.streams[0];
    };
    
    // Создаем offer для инициации соединения
    if (state.socket.id < state.partnerId) {
        state.peerConnection.createOffer()
            .then(offer => state.peerConnection.setLocalDescription(offer))
            .then(() => {
                state.socket.emit('offer', { 
                    offer: state.peerConnection.localDescription, 
                    to: state.partnerId 
                });
            })
            .catch(err => console.error('Ошибка при создании offer:', err));
    }
}

function resetConnection(elements) {
    if (state.peerConnection) {
        state.peerConnection.close();
        state.peerConnection = null;
    }
    
    if (elements.remoteVideo.srcObject) {
        elements.remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        elements.remoteVideo.srcObject = null;
    }
    
    state.currentRoom = null;
    state.partnerId = null;
}

function addMessage(container, sender, text) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', sender);
    
    const time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    messageElement.innerHTML = `
        <div class="message-content">${text}</div>
        <div class="message-time">${time}</div>
    `;
    
    container.appendChild(messageElement);
    container.scrollTop = container.scrollHeight;
}

function addSystemMessage(container, text) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', 'system');
    messageElement.textContent = text;
    container.appendChild(messageElement);
    container.scrollTop = container.scrollHeight;
}