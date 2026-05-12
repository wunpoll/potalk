import { 
  LoginResponse, RegisterResponse, UserResponse, 
  RoomsListResponse, RoomResponse, RoomDetailResponse,
  ProtocolsListResponse, ProtocolResponse, GenericResponse
} from '../types.ts';

const API_BASE_URL = '/api';

class ApiError extends Error {
  constructor(public status: number, public data: any) {
    super(data?.detail || data?.error || 'API Error');
  }
}

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('accessToken');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorData;
    try {
      errorData = await response.json();
    } catch {
      errorData = { error: response.statusText };
    }
    throw new ApiError(response.status, errorData);
  }

  if (response.status === 204) return {} as T;
  return response.json();
}

export const api = {
  auth: {
    login: (data: any) => fetchApi<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    register: (data: any) => fetchApi<RegisterResponse>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    logout: () => fetchApi<{success: boolean}>('/auth/logout', { method: 'POST' }),
    getMe: () => fetchApi<UserResponse>('/auth/me', { method: 'GET' }),
    getUsers: () => fetchApi<UserResponse[]>('/auth/users', { method: 'GET' }),
    updateUser: (id: string, data: any) => fetchApi<UserResponse>(`/auth/users/${id}`, { 
      method: 'PUT', 
      body: JSON.stringify(data) 
    }),
    invite: (data: any) => fetchApi<UserResponse>('/auth/invite', { 
      method: 'POST', 
      body: JSON.stringify(data) 
    }),
    forgotPassword: (email: string) => fetchApi<GenericResponse>('/auth/forgot-password', { 
      method: 'POST', 
      body: JSON.stringify({ email }) 
    }),
    resetPasswordConfirm: (data: any) => fetchApi<GenericResponse>('/auth/reset-password-confirm', { 
      method: 'POST', 
      body: JSON.stringify(data) 
    }),
    
    // ========================
    // НОВЫЕ МЕТОДЫ
    // ========================
    
    /** Обновить профиль текущего пользователя (first_name, last_name) */
    updateProfile: (data: { first_name?: string; last_name?: string }) => 
      fetchApi<UserResponse>('/auth/me', { 
        method: 'PATCH', 
        body: JSON.stringify(data) 
      }),
    
    /** Сменить пароль */
    changePassword: (data: { current_password: string; new_password: string }) => 
      fetchApi<GenericResponse>('/auth/change-password', { 
        method: 'POST', 
        body: JSON.stringify(data) 
      }),
  },

  rooms: {
    list: (params?: { status?: string; limit?: number; offset?: number }) => {
      const query = new URLSearchParams(params as any).toString();
      return fetchApi<RoomsListResponse>(`/rooms${query ? `?${query}` : ''}`, { method: 'GET' });
    },
    create: (data: any) => fetchApi<RoomResponse>('/rooms', { 
      method: 'POST', 
      body: JSON.stringify(data) 
    }),
    getById: (id: string) => fetchApi<RoomDetailResponse>(`/rooms/${id}`, { method: 'GET' }),
    update: (id: string, data: any) => fetchApi<RoomResponse>(`/rooms/${id}`, { 
      method: 'PUT', 
      body: JSON.stringify(data) 
    }),
    delete: (id: string) => fetchApi<void>(`/rooms/${id}`, { method: 'DELETE' }),
    archive: (id: string) => fetchApi<GenericResponse>(`/rooms/${id}/archive`, { method: 'PATCH' }),
    end: (id: string) => fetchApi<GenericResponse>(`/rooms/${id}/end`, { method: 'PATCH' }),
    regenerateInvite: (id: string) => fetchApi<{success: boolean, invite_code: string}>(`/rooms/${id}/regenerate-invite`, { method: 'POST' }),
    
    // ========================
    // НОВЫЕ МЕТОДЫ ДЛЯ INVITE MODAL
    // ========================
    
    /** Пригласить одного пользователя в комнату по email */
    inviteToRoom: (roomId: string, email: string) => 
      fetchApi<GenericResponse>(`/rooms/${roomId}/invite`, { 
        method: 'POST', 
        body: JSON.stringify({ email }) 
      }),
    
    /** Пригласить всех пользователей организации в комнату */
    inviteAllToRoom: (roomId: string) => 
      fetchApi<GenericResponse>(`/rooms/${roomId}/invite-all`, { 
        method: 'POST' 
      }),
  },

  protocols: {
    list: () => fetchApi<ProtocolsListResponse>('/protocols', { method: 'GET' }),
    listByRoom: (roomId: string) => fetchApi<ProtocolsListResponse>(`/rooms/${roomId}/protocols`, { 
      method: 'GET' 
    }),
    getById: (id: string) => fetchApi<ProtocolResponse>(`/protocols/${id}`, { method: 'GET' }),
    delete: (id: string) => fetchApi<void>(`/protocols/${id}`, { method: 'DELETE' }),
    
  },
  
  support: {
    sendMessage: (data: { subject: string; message: string; category: string }) =>
      fetchApi<{success: boolean}>('/support/contact', { 
        method: 'POST', 
        body: JSON.stringify(data) 
      }),
  },
  analytics: {
    getDashboard: () => fetchApi<any>('/analytics/dashboard', { method: 'GET' }),
  },

  
};