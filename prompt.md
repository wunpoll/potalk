
# Промпт для агента: Миграция с WebRTC Mesh P2P на LiveKit SFU

## Контекст проекта

Ты работаешь над проектом **Potalkyem** — платформой для аудиоконференций с текстовым чатом и AI-расшифровкой встреч.

**Стек:**
- Фронтенд: React + TypeScript + Tailwind + Vite
- Бэкенд: Python, FastAPI, SQLAlchemy, asyncpg, PostgreSQL, Redis
- Деплой: Render.com
- Реалтайм: WebSocket (FastAPI) для чата, presence, сигналинга WebRTC
- AI: Google Cloud Speech-to-Text V2 (STT), Gemini для протоколов встреч

---

## Почему мы переходим на LiveKit (обязательно прочитай)

### Проблема текущей архитектуры: Mesh P2P

Сейчас каждый участник устанавливает прямое WebRTC соединение с каждым другим участником.

```
Участник A ←——— RTCPeerConnection ———→ Участник B
Участник A ←——— RTCPeerConnection ———→ Участник C
Участник B ←——— RTCPeerConnection ———→ Участник C
```

При N участниках каждый браузер держит N-1 соединений.
При 100 участниках = **99 одновременных RTCPeerConnection на одну вкладку**.

**Конкретные последствия:**
1. **CPU/RAM браузера** — каждый поток требует декодирования. 99 аудиопотоков убивают любое устройство
2. **Upload bandwidth** — каждый участник отправляет свой аудиопоток 99 раз. При 100 kbps аудио = ~10 Mbps upload с одного браузера
3. **Сигналинг взрывается** — при входе нового участника нужно установить соединение со всеми. 100 участников = 4950 peer connections в комнате
4. **Нет масштабирования** — это физический потолок, не программная проблема

### Решение: SFU (Selective Forwarding Unit)

```
Участник A ——→ LiveKit SFU ——→ Участник B
Участник B ——→ LiveKit SFU ——→ Участник C
Участник C ——→ LiveKit SFU ——→ Участник A
```

Каждый участник отправляет один поток на сервер и получает один микс обратно.
**1 соединение на участника**, независимо от размера комнаты.

### Почему именно LiveKit, а не mediasoup/Janus/Jitsi

| Критерий | LiveKit | mediasoup | Janus |
|---|---|---|---|
| Язык сервера | Go (бинарник) | Node.js + C++ | C |
| Python SDK | ✅ официальный | ❌ нет | ❌ нет |
| Деплой | Docker / LiveKit Cloud | Нужен отдельный сервер | Сложная конфигурация |
| TURN встроен | ✅ | ❌ отдельно | ❌ отдельно |
| Документация | Отличная | Хорошая, но сложная | Устаревшая |
| Бесплатный tier | ✅ LiveKit Cloud | ❌ | ❌ |
| STT интеграция | ✅ встроенные Agents | Вручную | Вручную |

LiveKit — единственный вариант с официальным Python SDK, что критично для нашего FastAPI бэкенда.

---

## Текущий код который надо заменить

### Файлы затронутые миграцией:

**Бэкенд:**
- `websockets.py` — содержит обработку сигналинга (`offer`, `answer`, `ice-candidate`). После миграции эти типы сообщений можно убрать. WebSocket остаётся только для чата, presence и системных уведомлений.
- `stt_service.py` — текущий STT через Google Cloud Speech V2 с прямой передачей аудиочанков через WebSocket. После миграции заменяется на LiveKit Agents.
- Новый файл: `livekit_router.py` — эндпоинт для выдачи токенов доступа к комнате LiveKit.

**Фронтенд:**
- `src/services/websocket.ts` — класс `SignalingClient`. Убрать отправку `offer/answer/ice-candidate`. WebSocket остаётся для чата.
- `src/pages/Room.tsx` — весь WebRTC блок (строки ~159–512): `startAudio`, `createPeerConnection`, `handleWebRTCSignal`, `stopAudio`, `startAudioCapture`. Заменяется на LiveKit Room.

### Текущий WebRTC код в Room.tsx (для понимания масштаба замены):
```typescript
// ЭТО ВСЁ УДАЛЯЕТСЯ:
const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
const pendingIceCandidates = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
const startAudio = async () => { ... }            // ~30 строк
const createPeerConnection = async (...) => { ... } // ~80 строк  
const handleWebRTCSignal = async (...) => { ... }  // ~130 строк
const stopAudio = () => { ... }                    // ~15 строк
const startAudioCapture = async (...) => { ... }   // ~30 строк
```

---

## Что нужно сделать (пошаговое задание)

### Шаг 1: Переменные окружения

Добавь в `.env` (и в Render dashboard):
```
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret  
LIVEKIT_URL=wss://your-project.livekit.cloud
```

Получить на: https://cloud.livekit.io (бесплатный tier)

---

### Шаг 2: Бэкенд — установка зависимостей

```bash
pip install livekit livekit-api
```

Добавь в `requirements.txt`:
```
livekit>=0.11.0
livekit-api>=0.6.0
```

---

### Шаг 3: Бэкенд — новый файл `livekit_router.py`

Создай файл `livekit_router.py`:

```python
import os
from fastapi import APIRouter, Depends, HTTPException
from livekit.api import AccessToken, VideoGrants
import security
import models
from database import AsyncSessionLocal
from sqlalchemy import select

router = APIRouter(tags=["LiveKit"])

LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")
LIVEKIT_URL = os.getenv("LIVEKIT_URL")

@router.get("/api/rooms/{room_id}/livekit-token")
async def get_livekit_token(
    room_id: str,
    current_user_id: str = Depends(security.get_current_user_id)
):
    if not LIVEKIT_API_KEY or not LIVEKIT_API_SECRET:
        raise HTTPException(500, "LiveKit not configured")

    async with AsyncSessionLocal() as db:
        user_result = await db.execute(
            select(models.User).where(models.User.id == current_user_id)
        )
        user = user_result.scalars().first()
        if not user:
            raise HTTPException(404, "User not found")

    token = AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
    token.with_identity(str(user.id))
    token.with_name(f"{user.first_name} {user.last_name or ''}".strip())
    token.with_grants(VideoGrants(
        room_join=True,
        room=room_id,
        can_publish=True,
        can_subscribe=True,
    ))

    return {
        "token": token.to_jwt(),
        "url": LIVEKIT_URL,
    }
```

Подключи роутер в `main.py`:
```python
from livekit_router import router as livekit_router
app.include_router(livekit_router)
```

---

### Шаг 4: Бэкенд — упрощение `websockets.py`

В файле `websockets.py` удали обработку сигналинга из основного цикла сообщений:

```python
# УДАЛИТЬ эти elif блоки из while True цикла:
elif msg_type in ("offer", "answer", "ice-candidate"):
    # ... весь блок сигналинга
```

WebSocket теперь обрабатывает только:
- `chat` — сообщения чата
- `edit_chat` / `delete_chat` — редактирование
- `presence` — статусы (muted, hand_raised, speaking)
- `pong` — heartbeat
- `end_meeting` — завершение встречи

---

### Шаг 5: Фронтенд — установка зависимостей

```bash
npm install livekit-client
```

---

### Шаг 6: Фронтенд — новый сервис `src/services/livekitService.ts`

Создай файл:

```typescript
import {
  Room,
  RoomEvent,
  RemoteParticipant,
  RemoteTrackPublication,
  RemoteTrack,
  Track,
  LocalParticipant,
  ConnectionState,
} from 'livekit-client';
import { api } from './api';

export class LiveKitService {
  private room: Room | null = null;

  async connect(roomId: string): Promise<Room> {
    // Получаем токен с нашего бэкенда
    const { token, url } = await api.rooms.getLiveKitToken(roomId);

    this.room = new Room({
      adaptiveStream: true,
      dynacast: true, // экономит bandwidth — важно для 100+ участников
    });

    // Когда приходит аудиопоток от другого участника — воспроизводим
    this.room.on(RoomEvent.TrackSubscribed, (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant
    ) => {
      if (track.kind === Track.Kind.Audio) {
        const audioElement = track.attach();
        document.body.appendChild(audioElement);
        audioElement.play().catch(console.error);
      }
    });

    this.room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      track.detach();
    });

    await this.room.connect(url, token);
    return this.room;
  }

  async enableMicrophone() {
    await this.room?.localParticipant.setMicrophoneEnabled(true);
  }

  async disableMicrophone() {
    await this.room?.localParticipant.setMicrophoneEnabled(false);
  }

  async disconnect() {
    await this.room?.disconnect();
    this.room = null;
  }

  getRoom(): Room | null {
    return this.room;
  }

  getParticipantCount(): number {
    return this.room ? this.room.remoteParticipants.size + 1 : 0;
  }
}

export const livekitService = new LiveKitService();
```

---

### Шаг 7: Фронтенд — обновить `src/services/api.ts`

Добавь метод получения токена в объект `api.rooms`:

```typescript
getLiveKitToken: async (roomId: string) => {
  const res = await fetch(`/api/rooms/${roomId}/livekit-token`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` }
  });
  if (!res.ok) throw new Error('Failed to get LiveKit token');
  return res.json(); // { token: string, url: string }
},
```

---

### Шаг 8: Фронтенд — переписать аудио блок в `Room.tsx`

**Удали** весь следующий код из `Room.tsx`:
- `peerConnections` ref
- `pendingIceCandidates` ref  
- `localAudioRef` ref
- `audioContextRef` ref
- `processorRef` ref
- функцию `startAudio()`
- функцию `createPeerConnection()`
- функцию `handleWebRTCSignal()`
- функцию `stopAudio()`
- функцию `startAudioCapture()`
- функцию `stopAudioCapture()`
- обработчики `wsClient.on('offer', ...)`, `wsClient.on('answer', ...)`, `wsClient.on('ice-candidate', ...)`

**Добавь** в начало файла:
```typescript
import { livekitService } from '../services/livekitService';
import { RoomEvent } from 'livekit-client';
```

**Замени** логику аудио на:
```typescript
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
```

---

### Шаг 9: Фронтенд — убрать WebSocket обработчики сигналинга

В `Room.tsx` найди `useEffect` где подписываешься на WebSocket события и удали:
```typescript
// УДАЛИТЬ:
wsClient.on('offer', handleWebRTCSignal);
wsClient.on('answer', handleWebRTCSignal);
wsClient.on('ice-candidate', handleWebRTCSignal);
```

---

### Шаг 10: STT через LiveKit Agents (следующий этап)

> ⚠️ Это отдельная задача, не блокирует аудио миграцию.

Текущий STT (прямая передача PCM через WebSocket в Google Cloud) нужно заменить на **LiveKit Agents**. LiveKit умеет сам захватывать аудио участников и передавать в STT без костыля с `ScriptProcessorNode`.

```bash
pip install livekit-agents livekit-plugins-google
```

Создай `stt_agent.py`:
```python
from livekit.agents import AutoSubscribe, JobContext, WorkerOptions, cli
from livekit.agents.voice_assistant import VoiceAssistant
from livekit.plugins import google

async def entrypoint(ctx: JobContext):
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)
    
    stt = google.STT(languages=["ru-RU"])
    
    async for event in stt.stream():
        if event.is_final:
            # Отправить транскрипт через WebSocket в комнату
            pass

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
```

---

## Что НЕ меняется

- Вся логика чата (WebSocket `chat`, `edit_chat`, `delete_chat`)
- Presence статусы (WebSocket `presence`)  
- Системные уведомления (WebSocket `system`)
- База данных — таблицы `rooms`, `participants`, `chat_messages`, `protocols`
- REST API эндпоинты
- Heartbeat (ping/pong) в WebSocket
- Авторизация (JWT токены)
- `userSocket.ts` / глобальный пользовательский канал

---

## Проверка после миграции

1. Два браузера заходят в одну комнату
2. Оба нажимают на микрофон
3. В консоли должно быть: `Connected to LiveKit room`, без `RTCPeerConnection` логов
4. В LiveKit Cloud dashboard должны быть видны участники комнаты
5. Аудио должно передаваться в обе стороны

---

## Важные замечания для агента

- **Не трогай** `websockets.py` логику чата и presence — она работает
- **Не удаляй** `wsClient` из `Room.tsx` — он нужен для чата
- `livekit-client` на фронтенде и `livekit-api` на бэкенде — это разные пакеты, оба нужны
- LiveKit Cloud бесплатный tier ограничен 100 concurrent participants — для 100+ нужен paid план или self-hosted
- Self-hosted LiveKit разворачивается через Docker: `docker run -p 7880:7880 livekit/livekit-server`
