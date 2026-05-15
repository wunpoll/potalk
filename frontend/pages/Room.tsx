import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Mic, MicOff, PhoneOff, Users, MessageSquare, 
  Settings, Hand, Share, MoreVertical, Send, Info, FileText, Reply, X, Circle, Edit3, Trash2
} from 'lucide-react';
import { Participant, ChatMessage, ProtocolResponse, RoomResponse } from '../types.ts';
import ProtocolViewer from '../components/ProtocolViewer.tsx';
import ConnectionStatus from '../components/ConnectionStatus.tsx';
import { api } from '../services/api.ts';
import { wsClient, ConnectionState } from '../services/websocket.ts';
import { AlertTriangle } from 'lucide-react';
import { livekitService } from '../services/livekitService';
import { RoomEvent } from 'livekit-client';


// Кастомное модальное окно для подтверждения
const ConfirmDialog: React.FC<{
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}> = ({ isOpen, title, message, onConfirm, onCancel, confirmText = "Да", cancelText = "Отмена", danger = false }) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-gray-800 rounded-2xl w-96 max-w-[90%] shadow-2xl border border-gray-700 animate-slide-in">
        <div className="p-6">
          <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
          <p className="text-gray-300 text-sm">{message}</p>
        </div>
        <div className="flex gap-3 p-6 pt-0">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 font-medium transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
              danger 
                ? 'bg-red-600 hover:bg-red-700 text-white' 
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

const MOCK_PROTOCOL: ProtocolResponse = {
  id: 'prot_123',
  room_id: 'room_123',
  title: 'Протокол встречи отсутствует',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  summary_json: {
    summary: 'Встреча завершилась без аудио или данные еще обрабатываются.',
    topics: []
  },
  pdf_url: '#'
};

const ru = {
  chat: {
    title: "Чат встречи",
    placeholder: "Напишите сообщение...",
    reply: "Ответить",
    edit: "Редактировать",
    delete: "Удалить",
    deleted: "удалено",
    edited: "изменено",
  },
  room: {
    title: "Комната конференции",
    autoRecording: "Автозапись",
    participants: "Участники",
    meetingSummary: "Итоги встречи",
    duration: "Длительность",
    status: "Статус",
    meetingEnded: "Встреча завершена",
    backToDashboard: "На главную",
    leave: "Покинуть",
    endMeeting: "Завершить",
    endMeetingForEveryone: "Завершить встречу для всех",
    viewProtocol: "Просмотр протокола",
    settings: "Настройки",
    share: "Поделиться",
    more: "Ещё",
  },
  media: {
    title: "Диалог встречи",
    description: "Включите микрофон, чтобы начать обсуждение. Здесь будут отображаться субтитры в реальном времени.",
    listening: "Слушаем и расшифровываем...",
  },
  confirm: {
    deleteMessage: "Удалить сообщение?",
    deleteMessageWarning: "Вы уверены, что хотите удалить это сообщение?",
    endMeeting: "Завершить встречу?",
    endMeetingWarning: "Вы уверены, что хотите завершить встречу для всех участников? Это действие нельзя отменить.",
    yes: "Да",
    no: "Нет",
  }
};


declare global {
  interface Window {
    pendingOffers?: any[];
  }
}

export default function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  
  const [isMuted, setIsMuted] = useState(true);
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [showParticipants, setShowParticipants] = useState(true);
  const [chatInput, setChatInput] = useState('');
  
  // State is now dynamic, driven by WebSockets
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  const [replyingTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [isProtocolViewerOpen, setIsProtocolViewerOpen] = useState(false);
  
          // LIVE SUBTITLES STATE
  const [liveSubtitles, setLiveSubtitles] = useState<Record<string, { username: string, text: string, isFinal: boolean }>>({});
  const [dialogueHistory, setDialogueHistory] = useState<Array<{ username: string, text: string }>>([]);
  
  const [protocolData, setProtocolData] = useState<ProtocolResponse | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<RoomResponse | null>(null);

  const [audioConnected, setAudioConnected] = useState(false);

  const [elapsedTime, setElapsedTime] = useState('00:00:00');
  const userStr = localStorage.getItem('user');
  const currentUser = userStr ? JSON.parse(userStr) : null;

  const wsConnectedRef = useRef(false);
  const autoStartAttemptedRef = useRef(false);

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    danger?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    danger: false,
  });


  // ====== LiveKit Audio ======
  const startAudio = async () => {
    if (audioConnected || !roomId) return;
    try {
      await livekitService.connect(roomId);
      await livekitService.enableMicrophone();
      setAudioConnected(true);
      setIsMuted(false);
      wsClient.send('presence', { status: 'speaking', is_muted: false });
    } catch (err) {
      console.error('LiveKit connection failed:', err);
      alert('Не удалось подключиться к аудио');
    }
  };

  const stopAudio = async () => {
    await livekitService.disconnect();
    setAudioConnected(false);
    setIsMuted(true);
  };

  const toggleMic = async () => {
    if (!audioConnected) {
      await startAudio();
    } else if (!isMuted) {
      await livekitService.disableMicrophone();
      setIsMuted(true);
      wsClient.send('presence', { status: 'idle', is_muted: true });
    } else {
      await livekitService.enableMicrophone();
      setIsMuted(false);
      wsClient.send('presence', { status: 'speaking', is_muted: false });
    }
  };

  // Отключаемся при выходе из комнаты
  useEffect(() => {
    return () => {
      livekitService.disconnect();
    };
  }, []);
  // ====== End LiveKit Audio ======

  // Загрузка данных комнаты
  useEffect(() => {
    if (!roomId) return;
    api.rooms.getById(roomId).then(res => {
        const roomData = { ...res.room };
        if (roomData.started_at) {
            if (typeof roomData.started_at !== 'string') {
                roomData.started_at = new Date(roomData.started_at).toISOString();
            }
            if (!roomData.started_at.endsWith('Z') && !roomData.started_at.includes('+')) {
                roomData.started_at += 'Z';
            }
        }
        console.log('Room started_at:', roomData.started_at);
        console.log('ROOM DATA:', JSON.stringify(roomData, null, 2));
        setRoom(roomData);
        
        // Загружаем протоколы, если они есть в ответе
        if (res.protocols && res.protocols.length > 0) {
          setProtocolData(res.protocols[0]); // Берем самый свежий
        }

        // Загружаем участников из ответа API (для ended/archived комнат)
        if ((roomData.status === 'ended' || roomData.status === 'archived') && res.participants) {
          const loadedParticipants = res.participants
            .filter((p: any) => (p.userId || p.user_id) !== currentUser?.id)
            .map((p: any) => ({
              id: p.userId || p.user_id,
              user_id: p.userId || p.user_id,
              username: p.name || 'Unknown',
              role_in_room: (p.roleInRoom || 'participant') as 'organizer' | 'participant',
              is_muted: true,
              hand_raised: false,
              presence_status: 'idle' as const,
            }));
          if (loadedParticipants.length > 0) {
            setParticipants(loadedParticipants);
          }
        }
    }).catch(console.error);
}, [roomId]);

    // Таймер
    useEffect(() => {
        // Для завершённых комнат показываем итоговое время
        if (room?.duration_seconds && (room?.status === 'ended' || room?.status === 'archived')) {
            const h = String(Math.floor(room.duration_seconds / 3600)).padStart(2, '0');
            const m = String(Math.floor((room.duration_seconds % 3600) / 60)).padStart(2, '0');
            const s = String(room.duration_seconds % 60).padStart(2, '0');
            setElapsedTime(`${h}:${m}:${s}`);
            return;
        }

        if (!room?.started_at) {
            setElapsedTime('00:00:00');
            return;
        }

        const updateTimer = () => {
            const start = new Date(room.started_at!).getTime();
            const diff = Math.floor((Date.now() - start) / 1000);
            if (diff < 0) {
                setElapsedTime('00:00:00');
                return;
            }
            const h = String(Math.floor(diff / 3600)).padStart(2, '0');
            const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
            const s = String(diff % 60).padStart(2, '0');
            setElapsedTime(`${h}:${m}:${s}`);
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [room?.started_at, room?.status, room?.duration_seconds]);

  // ====== АВТО-ЗАПУСК АУДИО ПОСЛЕ ГОТОВНОСТИ WS ======
  

  useEffect(() => {
    wsConnectedRef.current = false;
    autoStartAttemptedRef.current = false;

    const unsubscribe = wsClient.onStateChange((state: ConnectionState) => {
      // Убираем проверку room — он ещё null в этом замыкании
      if (state === 'connected') {
        wsConnectedRef.current = true;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [roomId]);

    // useEffect(() => {
    //   if (
    //     room &&
    //     (room.status === 'scheduled' || room.status === 'active') &&
    //     wsConnectedRef.current &&
    //     !autoStartAttemptedRef.current
    //   ) {
    //     autoStartAttemptedRef.current = true;
    //     console.log('🎯 Auto-starting audio with muted mic');
        
    //     // Ждём появления participants_list НЕ БОЛЕЕ 3 секунд
    //     let attempts = 0;
    //     const maxAttempts = 30;
        
    //     const checkAndStart = setInterval(() => {
    //       attempts++;
          
    //       // Критично: нужно ждать, пока participants НЕ пустой И содержит других участников
    //       const hasOtherParticipants = participants.some(p => p.user_id !== currentUser?.id);
          
    //       if (hasOtherParticipants) {
    //         clearInterval(checkAndStart);
    //         console.log('✅ Other participants found, starting audio');
    //         startAudio();
    //       } else if (attempts >= maxAttempts) {
    //         clearInterval(checkAndStart);
    //         console.log('⚠️ Timeout waiting for participants, starting audio anyway (audio may not work)');
    //         startAudio();
    //       } else if (attempts % 5 === 0) { // Логируем каждые 5 попыток
    //         console.log(`Waiting for participants... (${attempts}/${maxAttempts})`, participants.map(p => p.user_id));
    //       }
    //     }, 100);
    //   }
    // }, [room, wsConnectedRef.current, participants, currentUser?.id]);
  // ====== КОНЕЦ АВТО-ЗАПУСКА ======

  // WebSocket Integration
  useEffect(() => {
    if (!roomId) return;
    
    const token = localStorage.getItem('accessToken');
    if (!token) {
      navigate('/login');
      return;
    }
    
    if (room?.status !== 'ended' && room?.status !== 'archived') {
      wsClient.connect(roomId, token);
    }

    const handleChatEdited = (data: any) => {
      setMessages(prev => prev.map(msg => {
        if (msg.id === data.messageId) {
          return { ...msg, message: data.message, edited_at: data.edited_at };
        }
        return msg;
      }));
    };

    // const handleChatDeleted = (data: any) => {
    //   setMessages(prev => prev.map(msg => {
    //     if (msg.id === data.messageId) {
    //       return { ...msg, message: "удалено", deleted_at: data.deleted_at };
    //     }
    //     return msg;
    //   }));
    // };

    const handleChatDeleted = (data: any) => {
      setMessages(prev => prev.map(msg => {
        if (msg.id === data.messageId) {
          return { ...msg, deleted_at: data.deleted_at }; // НЕ меняем message
        }
        return msg;
      }));
    };

    const handleIncomingChat = (msg: ChatMessage) => {
        // Если username нет — попробуй взять из userId (для старых сообщений)
        if (!msg.username && msg.user_id) {
            const participant = participants.find(p => p.user_id === msg.user_id);
            msg.username = participant?.username || 'User';
        }
        setMessages(prev => [...prev, msg]);
    };

    const handleSystem = (data: any) => {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        message: data.message,
        message_type: 'system',
        created_at: new Date().toISOString()
      }]);

      if (data.started_at) {
          const startedAt = (data.started_at.endsWith('Z') || data.started_at.includes('+')) 
              ? data.started_at 
              : data.started_at + 'Z';
          setRoom(prev => {
              if (!prev) return prev;
              return { ...prev, started_at: startedAt };
          });
      }

      if (data.message && data.message.includes('ended by organizer')) {
          navigate('/dashboard');
          return;
      }

      // joined block
      if (data.message.includes('joined')) {
        setParticipants(prev => {
          if (prev.find(p => p.user_id === (data.user_id || data.userId))) return prev;
          return [...prev, {
            id: data.user_id || data.userId,
            user_id: data.user_id || data.userId,
            username: data.username || 'User',
            role_in_room: 'participant' as const,
            is_muted: true,
            hand_raised: false,
            presence_status: 'idle' as const,
          }];
        });
      }
      // left block
      else if (data.message.includes('left')) {
        setParticipants(prev => prev.filter(p => p.user_id !== (data.user_id || data.userId)));
      }
    };

    const handlePresence = (data: any) => {
      setParticipants(prev => prev.map(p => {
        if (p.user_id === data.user_id) {
          return {
            ...p,
            presence_status: data.status || 'idle',
            is_muted: data.is_muted ?? p.is_muted,
            hand_raised: data.hand_raised ?? p.hand_raised,
          };
        }
        return p;
      }));
    };

    const handleMeetingEnded = (data: any) => {
      if (data.message) {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          message: data.message,
          message_type: 'system',
          created_at: new Date().toISOString()
        }]);
      }
      
      if (data.summary) {
        setProtocolData(data.summary as ProtocolResponse);
      }

      if (data.summary?.topic) {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          message: `Protocol "${data.summary.topic}" is ready.`,
          message_type: 'notification',
          created_at: new Date().toISOString()
        }]);
      }
      
      setRoom(prev => prev ? { ...prev, status: 'ended' } : null);
    };

    const handleSubtitle = (data: any) => {
      setLiveSubtitles(prev => ({
        ...prev,
        [data.user_id]: {
          username: data.user_name,
          text: data.text,
          isFinal: data.is_final
        }
      }));

      if (data.is_final) {
        setDialogueHistory(prev => [...prev, { username: data.user_name, text: data.text }]);
        setTimeout(() => {
          setLiveSubtitles(prev => {
            const next = { ...prev };
            delete next[data.user_id];
            return next;
          });
        }, 3000);
      }
    };

    const handleChatHistory = (data: any) => {
      if (data.messages && Array.isArray(data.messages)) {
        setMessages(prev => [...data.messages, ...prev]);
      }
    };

    wsClient.on('chat', handleIncomingChat);
    wsClient.on('chat_history', handleChatHistory);
    wsClient.on('chat_edited', handleChatEdited);
    wsClient.on('chat_deleted', handleChatDeleted);
    wsClient.on('system', handleSystem);
    wsClient.on('presence', handlePresence);
    wsClient.on('meeting_ended', handleMeetingEnded);
    wsClient.on('subtitle', handleSubtitle);

    const handleParticipantsList = (data: any) => {
      console.log('📋 Participants list received:', data);
      if (room?.status === 'ended' || room?.status === 'archived') return;
      if (data.participants) {
        const list = data.participants
          .filter((p: any) => (p.user_id || p.userId) !== currentUser?.id)
          .map((p: any) => ({
            id: p.user_id || p.userId,
            user_id: p.user_id || p.userId,
            username: p.username || 'User',
            role_in_room: 'participant' as const,
            is_muted: p.is_muted ?? true,
            hand_raised: p.hand_raised ?? false,
            presence_status: p.presence_status || 'idle',
          }));
        setParticipants(list);
      }
    };

    // Добавьте эту функцию перед wsClient.on
    // const handleParticipantsResponse = (data: any) => {
    //   console.log('📋 Participants response:', data);
    //   if (data.participants && Array.isArray(data.participants)) {
    //     setParticipants(prev => {
    //       const existing = new Set(prev.map(p => p.userId));
    //       const newParticipants = data.participants
    //         .filter((p: any) => !existing.has(p.userId))
    //         .map((p: any) => ({
    //           id: p.userId,
    //           userId: p.userId,
    //           username: p.username || 'User',
    //           roleInRoom: 'participant' as const,
    //           isMuted: false,
    //           handRaised: false,
    //           presenceStatus: 'idle' as const,
    //         }));
    //       return [...prev, ...newParticipants];
    //     });
    //   }
    // };

    
    wsClient.on('participants_list', handleParticipantsList);

    return () => {
      wsClient.off('chat', handleIncomingChat);
      wsClient.off('chat_history', handleChatHistory);
      wsClient.off('chat_edited', handleChatEdited);   // <-- ДОБАВИТЬ
      wsClient.off('chat_deleted', handleChatDeleted); // <-- ДОБАВИТЬ
      wsClient.off('system', handleSystem);
      wsClient.off('presence', handlePresence);
      wsClient.off('meeting_ended', handleMeetingEnded);
      wsClient.off('subtitle', handleSubtitle);
      wsClient.off('participants_list', handleParticipantsList);
      wsClient.disconnect();
    };
  }, [roomId, navigate]);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, showChat]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !roomId) return;
    
    // Send via WebSocket. The server will broadcast it back to us, 
    // so we don't append it locally here.
    wsClient.sendChat(roomId, chatInput.trim(), replyingTo?.id);
    
    setChatInput('');
    setReplyTo(null);
    wsClient.updatePresence('idle');
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setChatInput(e.target.value);
    if (e.target.value.length === 1) {
      wsClient.updatePresence('typing');
    } else if (e.target.value.length === 0) {
      wsClient.updatePresence('idle');
    }
  };

  const toggleHand = () => {
    const newState = !isHandRaised;
    setIsHandRaised(newState);
    wsClient.updatePresence(newState ? 'hand_raised' : 'idle');
  };

  const handleLeave = () => {
    navigate('/dashboard');
  };

  const handleEndMeeting = () => {
    if (!roomId) return;
    setConfirmDialog({
      isOpen: true,
      title: "Завершить встречу?",
      message: "Вы уверены, что хотите завершить встречу для всех участников? Это действие нельзя отменить.",
      danger: true,
      onConfirm: async () => {
        try {
          wsClient.send('end_meeting', { roomId });
          await api.rooms.end(roomId);
          navigate('/dashboard');
        } catch (err) { 
          alert("Не удалось завершить встречу"); 
        }
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  // Добавьте перед AudioLevelIndicator
  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    
    if (diffSec < 60) return 'только что';
    if (diffMin < 60) return `${diffMin} мин назад`;
    if (diffHour < 24) return `${diffHour} ч назад`;
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  };

  const handleEditMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !editingMessage) return;
    
    wsClient.send('edit_chat', { messageId: editingMessage.id, message: chatInput.trim() });
    setChatInput('');
    setEditingMessage(null);
    setReplyTo(null);
    wsClient.updatePresence('idle');
  };

  return (
    <div className="h-screen w-screen bg-gray-900 flex flex-col text-gray-100 overflow-hidden">
      {/* Top Header */}
      <header className="h-14 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center space-x-4">
          <div className="bg-blue-600 p-1.5 rounded-md">
            <Mic className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-sm">{ru.room.title}</h1>
            <div className="flex items-center space-x-2">
              {(room?.status !== 'ended' && room?.status !== 'archived') && (
                <span className="flex items-center text-xs text-red-400 font-medium animate-pulse">
                  <Circle className="w-2 h-2 fill-current mr-1" /> {ru.room.autoRecording}
                </span>
              )}
              <span className="text-gray-600">•</span>
              <span className="text-xs text-gray-400 font-mono">{elapsedTime}</span>
              <span className="text-gray-600">•</span>
              <ConnectionStatus />
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => setIsProtocolViewerOpen(true)}
            className="flex items-center space-x-2 px-3 py-1.5 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 rounded-md text-sm font-medium transition-colors mr-2"
          >
            <FileText className="w-4 h-4" />
            <span>{ru.room.viewProtocol}</span>
          </button>
          <button 
            onClick={() => setShowParticipants(!showParticipants)}
            className={`p-2 rounded-md transition-colors ${showParticipants ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}
          >
            <Users className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setShowChat(!showChat)}
            className={`p-2 rounded-md transition-colors ${showChat ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}`}
          >
            <MessageSquare className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Left Sidebar: Participants */}
        {showParticipants && (
          <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col shrink-0">
            <div className="p-4 border-b border-gray-700">
              <h2 className="font-semibold text-sm">Participants ({participants.length + 1})</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {/* Self Participant */}
              <div className="flex items-center justify-between p-2 rounded-md hover:bg-gray-700 group">
                <div className="flex items-center space-x-3 overflow-hidden">
                  <div className="relative">
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold">
                      {currentUser?.first_name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm truncate">
                      {currentUser?.first_name || 'You'} {currentUser?.last_name || ''}
                    </span>
                  </div>
                </div>
                {(room?.status !== 'ended' && room?.status !== 'archived') && (
                  <div className="flex items-center space-x-2 text-gray-400">
                    {isHandRaised && <Hand className="w-4 h-4 text-yellow-500" />}
                    {isMuted ? <MicOff className="w-4 h-4 text-red-400" /> : <Mic className="w-4 h-4 text-green-400" />}
                  </div>
                )}
              </div>

              {/* Remote Participants */}
              {participants.filter(p => p.user_id !== currentUser?.id).map(p => (
                <div key={p.id} className="flex items-center justify-between p-2 rounded-md hover:bg-gray-700 group">
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <div className="relative">
                      <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold">
                        {p.username.charAt(0).toUpperCase()}
                      </div>
                      {p.presence_status === 'speaking' && (
                        <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-green-500 border-2 border-gray-800 rounded-full"></span>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm truncate">{p.username}</span>
                      {p.presence_status === 'typing' && (
                        <span className="text-[10px] text-blue-400 italic">печатает...</span>
                      )}
                    </div>
                  </div>
                  {(room?.status !== 'ended' && room?.status !== 'archived') && (
                    <div className="flex items-center space-x-1 text-gray-400">
                      {p.hand_raised && <Hand className="w-4 h-4 text-yellow-500" />}
                      {p.is_muted ? <MicOff className="w-4 h-4 text-red-400" /> : <Mic className="w-4 h-4 text-green-400" />}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Center: Content Area */}
        <div className="flex-1 bg-gray-900 flex flex-col items-center justify-center p-6 relative">
          {(room?.status === 'ended' || room?.status === 'archived') ? (
            /* Итоговая информация для завершённых встреч */
            <div className="max-w-2xl w-full bg-gray-800/50 border border-gray-700 rounded-2xl p-8 backdrop-blur-sm">
              <h2 className="text-xl font-bold text-gray-200 mb-6 text-center">{ru.room.meetingSummary}</h2>
              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="bg-gray-700/50 rounded-xl p-4">
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{ru.room.duration}</p>
                  <p className="text-2xl font-bold text-white">{elapsedTime}</p>
                </div>
                <div className="bg-gray-700/50 rounded-xl p-4">
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{ru.room.participants}</p>
                  {/* total_participants — это общее кол-во уникальных людей за всё время из БД */}
                  <p className="text-2xl font-bold text-white">{room?.total_participants || 0}</p>
                </div>
                <div className="bg-gray-700/50 rounded-xl p-4 col-span-2">
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">{ru.room.status}</p>
                  <p className="text-lg font-bold text-purple-400 capitalize">{room.status}</p>
                </div>
              </div>
            </div>
          ) : (
            /* Активная встреча — Media & AI */
            <>
              {dialogueHistory.length === 0 ? (
                <>
                  <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none">
                    <Mic className="w-96 h-96" />
                  </div>
                  <div className="max-w-2xl w-full bg-gray-800/50 border border-gray-700 border-dashed rounded-2xl p-12 text-center backdrop-blur-sm">
                    <h2 className="text-2xl font-bold text-gray-300 mb-4">{ru.media.title}</h2>
                    <p className="text-gray-400 mb-6">{ru.media.description}</p>
                    <div className="flex flex-col items-center">
                      <div className="flex justify-center space-x-4 mb-4">
                        <div className="h-3 w-12 bg-blue-500 rounded-full animate-pulse"></div>
                        <div className="h-3 w-16 bg-blue-400 rounded-full animate-pulse delay-75"></div>
                        <div className="h-3 w-8 bg-blue-600 rounded-full animate-pulse delay-150"></div>
                      </div>
                      <p className="text-sm text-blue-400 font-medium">{ru.media.listening}</p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="max-w-3xl w-full h-[80%] bg-gray-800/80 border border-gray-700 rounded-2xl p-6 flex flex-col backdrop-blur-md shadow-2xl relative z-10 overflow-hidden">
                  <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-700">
                    <h2 className="text-xl font-bold text-gray-200">{ru.media.title}</h2>
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                      <span className="text-xs text-red-400 uppercase tracking-widest font-semibold">Live</span>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                    {dialogueHistory.map((msg, idx) => (
                      <div key={idx} className="flex flex-col animate-fade-in">
                        <span className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-1 px-1">
                          {msg.username}
                        </span>
                        <div className="bg-gray-700/50 p-3 rounded-lg rounded-tl-none border border-gray-600/50 shadow-sm inline-block max-w-[90%] text-gray-200">
                          {msg.text}
                        </div>
                      </div>
                    ))}
                    
                    {/* Текущие (еще не завершенные) субтитры */}
                    {Object.values(liveSubtitles).filter(sub => !sub.isFinal).map((sub, idx) => (
                       <div key={`live-${idx}`} className="flex flex-col animate-fade-in opacity-80">
                         <span className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1 px-1">
                           {sub.username}
                         </span>
                         <div className="bg-blue-900/20 p-3 rounded-lg rounded-tl-none border border-blue-800/50 shadow-sm inline-block max-w-[90%] text-gray-300">
                           {sub.text}
                           <span className="inline-block w-1.5 h-3 ml-1 bg-blue-500 animate-pulse"></span>
                         </div>
                       </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                </div>
              )}

              {/* LIVE SUBTITLES OVERLAY (Floating for small popups if needed, but mainly we use the history box above now) */}
              {dialogueHistory.length === 0 && (
                <div className="absolute bottom-10 left-0 right-0 flex flex-col items-center pointer-events-none space-y-2 px-6 z-20">
                  {Object.entries(liveSubtitles).map(([uid, sub]) => (
                    <div key={uid} className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 animate-fade-in max-w-lg">
                      <p className="text-[10px] text-blue-400 font-bold uppercase tracking-wider mb-0.5">{sub.username}</p>
                      <p className={`text-sm ${sub.isFinal ? 'text-white' : 'text-gray-300'}`}>
                        {sub.text}
                        {!sub.isFinal && <span className="inline-block w-1.5 h-3 ml-1 bg-blue-500 animate-pulse"></span>}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Right Sidebar: Chat */}
        {showChat && (
          <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col shrink-0">
            <div className="p-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="font-semibold text-sm">{ru.chat.title}</h2>
              <span className="text-xs text-gray-500">{messages.length}</span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {messages.map((msg) => {
                // Системные сообщения
                if (msg.message_type === 'system') {
                  return (
                    <div key={msg.id} className="flex justify-center animate-fade-in">
                      <div className="bg-gray-700/50 rounded-full px-4 py-1.5">
                        <span className="text-xs text-gray-400">{msg.message}</span>
                      </div>
                    </div>
                  );
                }
                
                // Уведомления о протоколе
                if (msg.message_type === 'notification') {
                  return (
                    <div 
                      key={msg.id} 
                      className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 border border-blue-800/50 rounded-xl p-3 cursor-pointer hover:from-blue-900/60 transition-all animate-slide-in"
                      onClick={() => setIsProtocolViewerOpen(true)}
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-400" />
                        <div className="flex-1">
                          <p className="text-sm text-blue-200 font-medium">Протокол готов</p>
                          <p className="text-xs text-blue-300/70">{msg.message}</p>
                        </div>
                      </div>
                    </div>
                  );
                }

                const isOwn = msg.user_id === currentUser?.id;
                
                return (
                  <div key={msg.id} className={`flex gap-2 animate-slide-in ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                    {/* Аватар */}
                    <div className="flex-shrink-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        isOwn ? 'bg-blue-600' : 'bg-indigo-600'
                      }`}>
                        {msg.username?.charAt(0).toUpperCase() || '?'}
                      </div>
                    </div>
                    
                    {/* Сообщение */}
                    <div className={`flex flex-col max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
                      <div className={`flex items-center gap-2 mb-1 text-xs ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                        <span className="font-medium text-blue-400">{msg.username}</span>
                        <span className="text-gray-500 text-[10px]">
                          {msg.created_at ? formatTimeAgo(msg.created_at) : ''}
                        </span>
                      </div>
                      
                      <div className={`rounded-2xl px-4 py-2 text-sm break-words relative group ${
                        isOwn ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-gray-700 text-gray-200 rounded-tl-sm'
                      }`}>
                        {msg.reply_to_id && (
                          <div className="mb-1 pb-1 border-b border-white/20 text-xs opacity-70">
                            ↳ {messages.find(m => m.id === msg.reply_to_id)?.message?.substring(0, 50)}
                          </div>
                        )}
                        
                        {msg.deleted_at ? (
                          <span className="text-gray-400 italic">{ru.chat.deleted}</span>
                        ) : (
                          <>
                            {msg.message}
                            {msg.edited_at && <span className="text-xs ml-2 opacity-50">({ru.chat.edited})</span>}
                          </>
                        )}
                        
                        {/* Кнопки действий при наведении - только для неудалённых сообщений */}
                        {room?.status !== 'ended' && room?.status !== 'archived' && !msg.deleted_at && (
                          <div className={`absolute top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${
                            isOwn ? '-left-16 flex-row-reverse' : '-right-16'
                          }`}>
                            {isOwn && (
                              <>
                                <button 
                                  onClick={() => {
                                    setEditingMessage(msg);
                                    setChatInput(msg.message);
                                  }}
                                  className="p-1 rounded-full bg-gray-700 hover:bg-yellow-600 text-gray-400 hover:text-white transition-colors"
                                  title={ru.chat.edit}
                                >
                                  <Edit3 className="w-3 h-3" />
                                </button>
                                <button 
                                  onClick={() => {
                                    setConfirmDialog({
                                      isOpen: true,
                                      title: "Удалить сообщение?",
                                      message: "Вы уверены, что хотите удалить это сообщение?",
                                      danger: false,
                                      onConfirm: () => {
                                        wsClient.send('delete_chat', { messageId: msg.id });
                                        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                                      }
                                    });
                                  }}
                                  className="p-1 rounded-full bg-gray-700 hover:bg-red-600 text-gray-400 hover:text-white transition-colors"
                                  title={ru.chat.delete}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </>
                            )}
                            <button 
                              onClick={() => setReplyTo(msg)}
                              className="p-1 rounded-full bg-gray-700 hover:bg-blue-600 text-gray-400 hover:text-white transition-colors"
                              title={ru.chat.reply}
                            >
                              <Reply className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Форма ввода */}
            {room?.status !== 'ended' && room?.status !== 'archived' ? (
              <div className="p-3 border-t border-gray-700 bg-gray-800">
                {/* Reply indicator */}
                {replyingTo && (
                  <div className="flex items-center justify-between bg-gray-700/50 px-3 py-2 rounded-t-lg border-b border-gray-600">
                    <div className="flex items-center gap-2 text-xs text-gray-300 truncate">
                      <Reply className="w-3 h-3" />
                      <span className="font-medium">{replyingTo.username}:</span>
                      <span className="truncate">{replyingTo.message.substring(0, 50)}</span>
                    </div>
                    <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-white">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                
                {/* Edit indicator */}
                {editingMessage && (
                  <div className="flex items-center justify-between bg-gray-700/50 px-3 py-2 rounded-t-lg border-b border-gray-600">
                    <div className="flex items-center gap-2 text-xs text-gray-300">
                      <Edit3 className="w-3 h-3" />
                      <span>Редактирование сообщения</span>
                    </div>
                    <button onClick={() => setEditingMessage(null)} className="text-gray-400 hover:text-white">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                
                <form onSubmit={editingMessage ? handleEditMessage : handleSendMessage} className="relative">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={handleTyping}
                    placeholder={ru.chat.placeholder}
                    className="w-full bg-gray-700 text-gray-100 border border-gray-600 rounded-xl pl-4 pr-12 py-2.5 text-sm focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 transition-all"
                  />
                  <button 
                    type="submit"
                    disabled={!chatInput.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            ) : (
              <div className="p-4 border-t border-gray-700 bg-gray-800 text-center">
                <span className="text-xs text-gray-500">Встреча завершена</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Control Bar — только для активных встреч */}
      {(room?.status !== 'ended' && room?.status !== 'archived') ? (
        <div className="h-20 bg-gray-800 border-t border-gray-700 flex items-center justify-center px-6 shrink-0 space-x-4">

          {/* <button 
            onClick={() => {
              console.log('Manual start audio');
              startAudio();
            }}
            className="p-4 rounded-full bg-yellow-500 hover:bg-yellow-600 text-white"
            title="Debug: Force start audio"
          >
            <Mic className="w-6 h-6" />
          </button> */}
          
          {/* Кнопка микрофона — единая: выкл / вкл / muted */}
          <button 
            onClick={toggleMic}
            className={`p-4 rounded-full flex items-center justify-center transition-colors ${
              !audioConnected 
                ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                : isMuted 
                  ? 'bg-red-500 hover:bg-red-600 text-white' 
                  : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
            title={!audioConnected ? 'Turn on microphone' : isMuted ? 'Unmute' : 'Mute'}
          >
            {!audioConnected ? <MicOff className="w-6 h-6" /> : isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>
          
          {/* Поднять руку */}
          <button 
            onClick={toggleHand}
            className={`p-4 rounded-full flex items-center justify-center transition-colors ${isHandRaised ? 'bg-yellow-500 hover:bg-yellow-600 text-white' : 'bg-gray-700 hover:bg-gray-600 text-white'}`}
            title={isHandRaised ? 'Lower hand' : 'Raise hand'}
          >
            <Hand className="w-6 h-6" />
          </button>

          {/* Настройки */}
          <button className="p-4 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition-colors" title={ru.room.settings}>
            <Settings className="w-6 h-6" />
          </button>
          
          {/* Поделиться */}
          <button className="p-4 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition-colors" title={ru.room.share}>
            <Share className="w-6 h-6" />
          </button>
          
          {/* Ещё */}
          <button className="p-4 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition-colors" title={ru.room.more}>
            <MoreVertical className="w-6 h-6" />
          </button>

          <div className="w-px h-8 bg-gray-600 mx-2"></div>

          {/* Покинуть */}
          <button 
            onClick={handleLeave}
            className="px-6 py-3 rounded-full bg-red-600 hover:bg-red-700 text-white font-medium flex items-center space-x-2 transition-colors"
          >
            <PhoneOff className="w-5 h-5" />
            <span>{ru.room.leave}</span>
          </button>
          
          {/* Завершить встречу (только организатор) */}
          {room?.creator_id === currentUser?.id && (
            <button onClick={handleEndMeeting} className="px-6 py-3 rounded-full bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 font-medium flex items-center space-x-2 transition-colors">
              <AlertTriangle className="w-5 h-5" />
              <span>{ru.room.endMeeting}</span>
            </button>
          )}
        </div>
      ) : (
        /* Для завершённых встреч — только кнопка назад */
        <div className="h-20 bg-gray-800 border-t border-gray-700 flex items-center justify-center px-6 shrink-0">
          <button 
            onClick={() => navigate('/dashboard')}
            className="px-6 py-3 rounded-full bg-gray-700 hover:bg-gray-600 text-white font-medium flex items-center space-x-2 transition-colors"
          >
            <PhoneOff className="w-5 h-5" />
            <span>{ru.room.backToDashboard}</span>
          </button>
        </div>
      )}

      <ProtocolViewer 
        isOpen={isProtocolViewerOpen} 
        onClose={() => setIsProtocolViewerOpen(false)} 
        protocol={protocolData || MOCK_PROTOCOL} 
      />

      {/* Модальное окно подтверждения - ВСТАВЬТЕ ЭТО ЗДЕСЬ */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={() => confirmDialog.onConfirm()}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
        danger={confirmDialog.danger}
      />

    </div>
  );
}