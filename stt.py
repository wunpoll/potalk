import queue
import sys
import os
import pyaudio
import google.auth
from google.cloud.speech_v2 import SpeechClient
from google.cloud.speech_v2.types import cloud_speech as cloud_speech_types
from google import genai
from google.genai import types

# --- НАСТРОЙКИ ---
RATE = 16000
CHUNK = int(RATE / 10)  # Чанки по 100 мс

# ID твоего проекта Google Cloud
PROJECT_ID = "theta-shuttle-492107-a1" 
REGION = "eu" # В европейском регионе лучшая поддержка ru-RU для модели long

# Инициализация клиента Gemini через Vertex AI
ai_client = genai.Client(
    vertexai=True,
    project=PROJECT_ID,
    location="global" # Gemini лучше оставить в global или us-central1
)

# --- ФУНКЦИЯ ДЛЯ ПОЛУЧЕНИЯ/СОЗДАНИЯ РАСПОЗНАВАТЕЛЯ (V2) ---
def get_or_create_recognizer(client):
    recognizer_id = "russian-diarization-v2"
    recognizer_name = f"projects/{PROJECT_ID}/locations/{REGION}/recognizers/{recognizer_id}"
    
    try:
        recognizer = client.get_recognizer(name=recognizer_name)
        return recognizer.name
    except Exception:
        print(f"🛠 Создание распознавателя {recognizer_id}...")
        request = cloud_speech_types.CreateRecognizerRequest(
            parent=f"projects/{PROJECT_ID}/locations/{REGION}",
            recognizer_id=recognizer_id,
            recognizer=cloud_speech_types.Recognizer(
            default_recognition_config=cloud_speech_types.RecognitionConfig(
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
            ),
        ),
        )
        operation = client.create_recognizer(request=request)
        return operation.result().name

# --- КЛАСС ДЛЯ ЗАХВАТА ЗВУКА ---
class MicrophoneStream:
    def __init__(self, rate, chunk):
        self._rate = rate
        self._chunk = chunk
        self._buff = queue.Queue()
        self.closed = True

    def __enter__(self):
        self._audio_interface = pyaudio.PyAudio()
        self._audio_stream = self._audio_interface.open(
            format=pyaudio.paInt16,
            channels=1, rate=self._rate,
            input=True, frames_per_buffer=self._chunk,
            stream_callback=self._fill_buffer,
        )
        self.closed = False
        return self

    def __exit__(self, type, value, traceback):
        self._audio_stream.stop_stream()
        self._audio_stream.close()
        self.closed = True
        self._buff.put(None)
        self._audio_interface.terminate()

    def _fill_buffer(self, in_data, frame_count, time_info, status_flags):
        self._buff.put(in_data)
        return None, pyaudio.paContinue

    def generator(self):
        while not self.closed:
            chunk = self._buff.get()
            if chunk is None:
                return
            yield chunk

# --- ГЕНЕРАТОР ЗАПРОСОВ ДЛЯ V2 ---
def request_generator(stream, recognizer_name):
    """
    В API V2 первый запрос в стриме ОБЯЗАТЕЛЬНО должен содержать настройки (config) или имя recognizer.
    """
    streaming_config = cloud_speech_types.StreamingRecognitionConfig(
        # Мы используем конфиг из Recognizer, но можем переопределить interim_results здесь
        streaming_features=cloud_speech_types.StreamingRecognitionFeatures(
            interim_results=True
        )
    )

    # Отправляем ПЕРВЫЙ запрос с именем созданного нами распознавателя
    yield cloud_speech_types.StreamingRecognizeRequest(
        recognizer=recognizer_name,
        streaming_config=streaming_config,
    )

    # Отправляем ПОСЛЕДУЮЩИЕ запросы с аудио
    for content in stream.generator():
        yield cloud_speech_types.StreamingRecognizeRequest(audio=content)

# --- ОБРАБОТКА ОТВЕТОВ ---
def listen_print_loop(responses, transcript_list):
    print("\n🎤 Идет запись... Говорите. Для завершения и анализа нажмите Ctrl+C\n")
    for response in responses:
        if not response.results:
            continue

        result = response.results[0]
        if not result.alternatives:
            continue

        transcript = result.alternatives[0].transcript

        if not result.is_final:
            # Выводим промежуточный текст в ту же строку
            sys.stdout.write(f"Живой текст: {transcript}\r")
            sys.stdout.flush()
        else:
            # Так как диаризация API отключена, выводим просто текст.
            # Gemini позже сама разберется, кто что говорил.
            final_line = transcript
            print(f"\n{final_line}")
            transcript_list.append(final_line)

# --- ГЕНЕРАЦИЯ КОНСПЕКТА В GEMINI ---
def generate_summary(text):
    print("\n" + "="*50)
    print("🤖 Gemini анализирует встречу...")
    
    prompt = f"""
    Ты — профессиональный секретарь. Проанализируй транскрипт созвона.
    ВАЖНО: В транскрипте нет меток спикеров. Сначала восстанови диалог, 
    разделив текст по ролям на основе контекста, а затем сделай конспект.
    
    Верни результат строго в формате JSON.
    
    Структура:
    {{
      "restored_dialogue": [ {{"speaker": "Спикер 1", "text": "..."}} ],
      "topic": "Тема",
      "summary": "Краткая суть",
      "tasks": [ {{"assignee": "кто", "task": "что сделать"}} ],
      "qa": [ {{"question": "вопрос", "answer": "ответ"}} ]
    }}

    Транскрипт:
    {text}
    """

    try:
        response = ai_client.models.generate_content(
            model='gemini-3-flash-preview',
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=1,
                top_p=0.95,
                max_output_tokens=65535,
                response_mime_type="application/json",
                safety_settings=[
                    types.SafetySetting(category="HARM_CATEGORY_HATE_SPEECH", threshold="OFF"),
                    types.SafetySetting(category="HARM_CATEGORY_DANGEROUS_CONTENT", threshold="OFF"),
                    types.SafetySetting(category="HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold="OFF"),
                    types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="OFF")
                ],
                thinking_config=types.ThinkingConfig(thinking_level="HIGH")
            )
        )
        print("\n✨ ИТОГОВЫЙ КОНСПЕКТ:")
        print(response.text)
    except Exception as e:
        print(f"❌ Ошибка Gemini: {e}")

# --- ОСНОВНОЙ ЗАПУСК ---
def main():
    if PROJECT_ID == "ТВОЙ_PROJECT_ID":
        print("❌ Ошибка: Укажи свой PROJECT_ID в коде или проверь GOOGLE_APPLICATION_CREDENTIALS")
        return

    # В V2 для использования региональных фишек (как диаризация) 
    # нужно подключаться к региональному эндпоинту.
    client = SpeechClient(client_options={
        "api_endpoint": f"{REGION}-speech.googleapis.com"
    })
    
    # Получаем или создаем распознаватель с включенной диаризацией
    recognizer_name = get_or_create_recognizer(client)
    
    transcript_list = []

    with MicrophoneStream(RATE, CHUNK) as stream:
        requests = request_generator(stream, recognizer_name)
        
        # Запускаем стриминг в Google
        responses = client.streaming_recognize(requests=requests)

        try:
            listen_print_loop(responses, transcript_list)
        except KeyboardInterrupt:
            print("\n\n⏹ Запись остановлена.")

    # Если текст собран — отправляем в нейронку
    full_text = "\n".join(transcript_list)
    if full_text.strip():
        generate_summary(full_text)
    else:
        print("📭 Кажется, ничего не было записано.")

if __name__ == "__main__":
    main()