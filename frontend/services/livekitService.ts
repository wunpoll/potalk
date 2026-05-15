import {
  Room,
  RoomEvent,
  RemoteParticipant,
  RemoteTrackPublication,
  RemoteTrack,
  Track,
} from 'livekit-client';
import { Track } from 'livekit-client';
import { api } from './api';
import { startAudioStreaming, stopAudioStreaming } from './audioStreamer';

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
    const micTrack = this.room?.localParticipant.getTrackPublication(Track.Source.Microphone);
    if (micTrack && micTrack.track?.mediaStreamTrack) {
      startAudioStreaming(micTrack.track.mediaStreamTrack);
    }
  }

  async disableMicrophone() {
    await this.room?.localParticipant.setMicrophoneEnabled(false);
    stopAudioStreaming();
  }

  async disconnect() {
    stopAudioStreaming();
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
