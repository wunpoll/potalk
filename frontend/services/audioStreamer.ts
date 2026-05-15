import { wsClient } from './websocket';

let audioContext: AudioContext | null = null;
let processor: ScriptProcessorNode | null = null;
let source: MediaStreamAudioSourceNode | null = null;

export function startAudioStreaming(mediaStreamTrack: MediaStreamTrack) {
  if (audioContext) {
    stopAudioStreaming();
  }

  const stream = new MediaStream([mediaStreamTrack]);
  audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
    sampleRate: 16000,
  });

  source = audioContext.createMediaStreamSource(stream);
  
  // Use a buffer size of 4096 (around 256ms at 16000Hz)
  processor = audioContext.createScriptProcessor(4096, 1, 1);
  
  processor.onaudioprocess = (e) => {
    if (!wsClient) return;
    
    const float32Array = e.inputBuffer.getChannelData(0);
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    
    wsClient.sendBinary(int16Array.buffer);
  };
  
  source.connect(processor);
  processor.connect(audioContext.destination);
}

export function stopAudioStreaming() {
  if (processor) {
    processor.disconnect();
    processor = null;
  }
  if (source) {
    source.disconnect();
    source = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
}
