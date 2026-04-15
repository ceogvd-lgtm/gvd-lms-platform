/**
 * Notification API wrappers + Socket.io client factory.
 *
 * REST: unread-count, list, markRead, markAllRead — fetch-based, pairs with
 *       TanStack Query in the bell component.
 * Socket: lazily created singleton that authenticates via `handshake.auth.token`
 *         and emits `notification` / `unreadCount` events.
 */
import { io, type Socket } from 'socket.io-client';

import { api } from './api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

// The socket server URL is the API origin without the /api/v1 prefix.
const SOCKET_URL = API_URL.replace(/\/api\/v1\/?$/, '');

export interface AppNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  data: unknown;
  isRead: boolean;
  createdAt: string;
}

export interface PaginatedNotifications {
  data: AppNotification[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ---------- REST ----------

export const notificationsApi = {
  list: (params: { page?: number; limit?: number; unreadOnly?: boolean }, token: string) => {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.unreadOnly) qs.set('unreadOnly', 'true');
    const q = qs.toString();
    return api<PaginatedNotifications>(`/notifications${q ? `?${q}` : ''}`, { token });
  },

  unreadCount: (token: string) => api<{ count: number }>('/notifications/unread-count', { token }),

  markRead: (id: string, token: string) =>
    api<{ message: string }>(`/notifications/${id}/read`, {
      method: 'PATCH',
      token,
    }),

  markAllRead: (token: string) =>
    api<{ count: number }>('/notifications/read-all', {
      method: 'PATCH',
      token,
    }),
};

// ---------- Socket.io singleton ----------

let socketInstance: Socket | null = null;

/**
 * Connect to /notifications namespace with the current JWT. Re-uses the
 * existing socket if it's already connected with the same token; otherwise
 * disconnects the old one and opens a fresh session.
 *
 * Call `disconnectNotificationsSocket()` on logout to clean up.
 */
export function connectNotificationsSocket(token: string): Socket {
  if (socketInstance && socketInstance.auth && typeof socketInstance.auth === 'object') {
    const existingToken = (socketInstance.auth as { token?: string }).token;
    if (existingToken === token && socketInstance.connected) {
      return socketInstance;
    }
    socketInstance.disconnect();
  }
  socketInstance = io(`${SOCKET_URL}/notifications`, {
    auth: { token },
    // reconnect automatically — useful when the user's laptop wakes from sleep
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    transports: ['websocket', 'polling'],
  });
  return socketInstance;
}

export function disconnectNotificationsSocket(): void {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}

/** Vietnamese label for a notification type — used in the bell dropdown. */
export function notificationTypeLabel(type: string): string {
  switch (type) {
    case 'COURSE_ENROLLED':
      return 'Khoá học';
    case 'LESSON_COMPLETED':
      return 'Hoàn thành bài';
    case 'CERTIFICATE_ISSUED':
      return 'Chứng chỉ';
    case 'QUIZ_GRADED':
      return 'Kết quả bài kiểm tra';
    case 'INSTRUCTOR_FEEDBACK':
      return 'Phản hồi giảng viên';
    case 'SYSTEM_ALERT':
      return 'Hệ thống';
    default:
      return type;
  }
}
