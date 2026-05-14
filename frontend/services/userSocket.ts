import { SignalingClient } from './websocket.ts';

const userWsClient = new SignalingClient();
let isConnected = false;

userWsClient.onStateChange((state) => {
    if (state === 'disconnected' || state === 'error') {
        isConnected = false;
    }
});

export const initUserSocket = () => {
    const token = localStorage.getItem('accessToken');
    if (!token || isConnected) return;
    
    // Создаём специальную комнату для глобальных уведомлений пользователя
    const userId = JSON.parse(localStorage.getItem('user') || '{}').id;
    if (!userId) return;
    
    userWsClient.connect(`user_${userId}`, token);
    isConnected = true;
    
    console.log('🔌 User global WebSocket initialized');
};

export const getUserSocket = () => userWsClient;