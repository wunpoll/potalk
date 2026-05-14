type WSMessageHandler = (payload: any) => void;
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export class SignalingClient {
  private ws: WebSocket | null = null;
  private handlers: Map<string, Set<WSMessageHandler>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private url: string;
  private state: ConnectionState = 'disconnected';
  private stateListeners: Set<(state: ConnectionState) => void> = new Set();
  private intentionalDisconnect = false;

  constructor() {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = isLocal ? 'localhost:8000' : window.location.host;
    this.url = `${protocol}//${host}`;
  }

  private setState(newState: ConnectionState) {
    this.state = newState;
    this.stateListeners.forEach(listener => listener(newState));
  }

  getState(): ConnectionState {
    return this.state;
  }

  onStateChange(listener: (state: ConnectionState) => void) {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  connect(roomId: string, token: string) {
    if (this.ws?.readyState === WebSocket.OPEN || this.state === 'connecting') return;

    this.setState('connecting');

    try {
      // ИСПОЛЬЗУЕМ roomId ИЗ ПАРАМЕТРОВ ФУНКЦИИ, А НЕ user_id
      const wsUrl = `${this.url}/ws/${roomId}?token=${token}`;
      console.log('Connecting to WebSocket:', wsUrl.replace(token, 'HIDDEN_TOKEN'));
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.setState('connected');
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Авто-ответ на ping
          if (data.type === 'ping') {
            this.send('pong', {});
            return;
          }
          
          this.emit(data.type, data);
        } catch (e) {
          console.error('Failed to parse WS message', e);
        }
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket disconnected', event.reason);
        this.setState('disconnected');
        if (!event.wasClean && !this.intentionalDisconnect) {
          this.handleReconnect(roomId, token);
        }
        this.intentionalDisconnect = false;
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error', error);
        this.setState('error');
      };
    } catch (e) {
      this.setState('error');
      this.handleReconnect(roomId, token);
    }
  }

  private handleReconnect(roomId: string, token: string) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
      console.log(`Reconnecting in ${delay}ms...`);
      setTimeout(() => this.connect(roomId, token), delay);
    }
  }

  disconnect() {
    if (this.ws) {
      this.intentionalDisconnect = true;
      this.ws.close();
      this.ws = null;
    }
    this.setState('disconnected');
  }

  send(type: string, payload: any = {}) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, ...payload }));
    } else {
      console.warn('WebSocket is not open:', type);
    }
  }

  sendBinary(data: Blob | ArrayBuffer) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  on(type: string, handler: WSMessageHandler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
  }

  off(type: string, handler: WSMessageHandler) {
    const typeHandlers = this.handlers.get(type);
    if (typeHandlers) {
      typeHandlers.delete(handler);
    }
  }

  private emit(type: string, payload: any) {
    const typeHandlers = this.handlers.get(type);
    if (typeHandlers) {
      typeHandlers.forEach(handler => handler(payload));
    }
  }

  sendChat(roomId: string, message: string, replyToId?: string) {
    this.send('chat', { roomId, message, reply_to_id: replyToId });
  }

  updatePresence(status: 'speaking' | 'typing' | 'hand_raised' | 'idle', target: string = 'broadcast') {
    this.send('presence', { status, target });
  }
}

export const wsClient = new SignalingClient();