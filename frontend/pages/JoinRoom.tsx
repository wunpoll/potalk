import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Loader2, AlertCircle, Mic, Home } from 'lucide-react';
import { api } from '../services/api.ts';
import { RoomStatus } from '../types.ts';

export default function JoinRoom() {
  const { inviteCode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const resolveInvite = async () => {
      const token = localStorage.getItem('accessToken');
      
      // Нет токена → на логин
      if (!token) {
        const returnPath = `/join/${inviteCode}`;
        sessionStorage.setItem('redirectAfterLogin', returnPath);
        navigate('/login', { state: { returnTo: returnPath } });
        return;
      }

      try {
        const response = await api.rooms.list({ limit: 100 }); 
        const room = response.rooms.find(r => r.invite_code === inviteCode);

        if (room) {
          if (room.status === RoomStatus.ENDED || room.status === RoomStatus.ARCHIVED) {
            setError("Эта встреча уже завершена.");
            return;
          }
          navigate(`/room/${room.id}`);
        } else {
          setError("Недействительная или просроченная ссылка-приглашение. Проверьте код.");
        }
      } catch (err: any) {
        console.error("Join error:", err);
        
        // Если ошибка валидации (401) — токен протух, чистим и редиректим на логин
        if (err.status === 401) {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          const returnPath = `/join/${inviteCode}`;
          sessionStorage.setItem('redirectAfterLogin', returnPath);
          navigate('/login', { state: { returnTo: returnPath } });
          return;
        }
        
        setError("Не удалось подключиться к серверу. Пожалуйста, попробуйте позже.");
      }
    };

    if (inviteCode) {
      resolveInvite();
    }
  }, [inviteCode, navigate, location]);

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4 text-center">
      {!error ? (
        <div className="animate-in fade-in duration-500">
          <div className="relative">
            <div className="w-20 h-20 bg-gradient-to-r from-blue-600 to-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-600/30 animate-pulse-slow">
              <Mic className="w-10 h-10 text-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 rounded-full border-4 border-white animate-ping"></div>
          </div>
          <h2 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
            Подключение к конференции...
          </h2>
          <p className="text-gray-500 mt-3 max-w-sm">
            Идёт подключение к серверу, пожалуйста, подождите
          </p>
          <div className="flex justify-center gap-2 mt-6">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      ) : (
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-200 max-w-md w-full animate-in zoom-in duration-300">
          <div className="w-20 h-20 bg-gradient-to-r from-red-100 to-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Ошибка подключения</h2>
          <p className="text-gray-600 mt-2 leading-relaxed">{error}</p>
          <div className="mt-8 space-y-3">
            <button 
              onClick={() => navigate('/dashboard')} 
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white rounded-xl font-bold transition-all active:scale-[0.98] shadow-md flex items-center justify-center gap-2"
            >
              <Home className="w-4 h-4" />
              Вернуться на главную
            </button>
            <button 
              onClick={() => window.location.reload()} 
              className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-all"
            >
              Попробовать снова
            </button>
          </div>
        </div>
      )}
    </div>
  );
}