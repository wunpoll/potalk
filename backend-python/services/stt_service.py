import asyncio
import os
import json
import logging
from typing import AsyncGenerator, Dict, List
from google.cloud.speech_v2 import SpeechAsyncClient
from google.cloud.speech_v2.types import cloud_speech as cloud_speech_types
from google import genai
from google.genai import types

logger = logging.getLogger("STTService")

# --- НАСТРОЙКИ ---
RATE = 16000
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "theta-shuttle-492107-a1")
REGION = "eu"

# Инициализация клиента Gemini
ai_client = genai.Client(
    vertexai=True,
    project=PROJECT_ID,
    location="global"
)

class STTManager:
    """Управляет стримингом аудио в Google STT V2 для одного пользователя."""

    def __init__(self, room_id: str, user_id: str, user_name: str, send_subtitle_func):
        self.room_id = room_id
        self.user_id = user_id
        self.user_name = user_name
        self.send_subtitle = send_subtitle_func
        
        self.client = SpeechAsyncClient(client_options={
            "api_endpoint": f"{REGION}-speech.googleapis.com"
        })
        
        self._audio_queue = asyncio.Queue()
        self._is_running = False
        self._transcript_list = []
        self._recognizer_name = f"projects/{PROJECT_ID}/locations/{REGION}/recognizers/_"

    async def add_audio(self, chunk: bytes):
        """Добавляет чанк аудио в очередь для обработки."""
        await self._audio_queue.put(chunk)

    async def _request_generator(self) -> AsyncGenerator:
        """Генератор запросов для Google STT V2."""
        # 1. Первый запрос с конфигурацией
        recognition_config = cloud_speech_types.RecognitionConfig(
            explicit_decoding_config=cloud_speech_types.ExplicitDecodingConfig(
                encoding=cloud_speech_types.ExplicitDecodingConfig.AudioEncoding.LINEAR16,
                sample_rate_hertz=RATE,
                audio_channel_count=1,
            ),
            language_codes=["ru-RU"],
            model="long",
            features=cloud_speech_types.RecognitionFeatures(
                enable_automatic_punctuation=True,
            ),
        )

        streaming_config = cloud_speech_types.StreamingRecognitionConfig(
            config=recognition_config,
            streaming_features=cloud_speech_types.StreamingRecognitionFeatures(
                interim_results=True
            )
        )

        yield cloud_speech_types.StreamingRecognizeRequest(
            recognizer=self._recognizer_name,
            streaming_config=streaming_config,
        )

        # 2. Последующие запросы с аудио из очереди
        while self._is_running:
            try:
                # Ждем чанк из очереди. Если пусто — ждем.
                content = await self._audio_queue.get()
                if content is None: # Сигнал остановки
                    break
                yield cloud_speech_types.StreamingRecognizeRequest(audio=content)
            except Exception as e:
                logger.error(f"Error in request generator: {e}")
                break

    async def start(self):
        """Запускает процесс распознавания."""
        self._is_running = True
        logger.info(f"Starting STT for user {self.user_name} in room {self.room_id}")
        
        try:
            # Google Cloud Python SDK v2 асинхронный стриминг ожидает асинхронный генератор
            responses = await self.client.streaming_recognize(requests=self._request_generator())

            async for response in responses:
                if not self._is_running:
                    break
                if not response.results:
                    continue

                result = response.results[0]
                if not result.alternatives:
                    continue

                transcript = result.alternatives[0].transcript
                is_final = result.is_final

                # Отправляем субтитры
                await self.send_subtitle({
                    "type": "subtitle",
                    "user_id": self.user_id,
                    "user_name": self.user_name,
                    "text": transcript,
                    "is_final": is_final
                })

                if is_final:
                    self._transcript_list.append(f"{self.user_name}: {transcript}")

        except Exception as e:
            if self._is_running: # Игнорируем ошибки при штатной остановке
                logger.error(f"STT Error for {self.user_id}: {e}")
        finally:
            self._is_running = False

    async def stop(self):
        """Останавливает распознавание."""
        self._is_running = False
        await self._audio_queue.put(None)
        return self._transcript_list

async def generate_meeting_protocol(room_id: str, full_transcript: str):
    """Генерирует финальный протокол встречи через Gemini."""
    logger.info(f"Generating summary for room {room_id}...")
    
    prompt = f"""
    Ты — профессиональный секретарь. Проанализируй транскрипт созвона.
    Текст уже разделен по именам участников. Составь подробный протокол встречи.
    
    Верни результат строго в формате JSON.
    
    Структура:
    {{
      "topic": "Тема встречи",
      "summary": "Краткая суть обсуждения",
      "decisions": ["Решение 1", "Решение 2"],
      "tasks": [ {{"assignee": "имя", "task": "что сделать"}} ],
      "qa": [ {{"question": "вопрос", "answer": "ответ"}} ]
    }}

    Транскрипт:
    {full_transcript}
    """

    try:
        response = ai_client.models.generate_content(
            model='gemini-2.0-flash-exp', # Используем актуальную модель
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=0.7,
                response_mime_type="application/json",
            )
        )
        return json.loads(response.text)
    except Exception as e:
        logger.error(f"Gemini Summary Error: {e}")
        return None
