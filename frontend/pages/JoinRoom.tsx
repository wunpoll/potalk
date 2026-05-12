import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
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
            setError("This meeting has already ended.");
            return;
          }
          navigate(`/room/${room.id}`);
        } else {
          setError("Invalid or expired invite link. Please check the code.");
        }
      } catch (err: any) {
        console.error("Join error:", err);
        
        // 🟢 НОВОЕ: Если ошибка валидации (401) — токен протух, чистим и редиректим на логин
        if (err.status === 401) {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          const returnPath = `/join/${inviteCode}`;
          sessionStorage.setItem('redirectAfterLogin', returnPath);
          navigate('/login', { state: { returnTo: returnPath } });
          return;
        }
        
        setError("Unable to connect to the server. Please try again later.");
      }
    };

    if (inviteCode) {
      resolveInvite();
    }
  }, [inviteCode, navigate, location]);

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-gray-50 p-4 text-center">
      {!error ? (
        <div className="animate-in fade-in duration-500">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Joining Meeting...</h2>
          <p className="text-gray-500 mt-2">Connecting to conference, please wait.</p>
        </div>
      ) : (
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-200 max-w-md w-full animate-in zoom-in duration-300">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900">Oops!</h2>
          <p className="text-gray-600 mt-4">{error}</p>
          <button 
            onClick={() => navigate('/dashboard')} 
            className="mt-6 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      )}
    </div>
  );
}