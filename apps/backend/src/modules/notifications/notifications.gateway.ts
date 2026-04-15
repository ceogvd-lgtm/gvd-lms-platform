import type { JwtPayload } from '@lms/types';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import { NotificationsService } from './notifications.service';

/**
 * Socket.io gateway for live in-app notifications.
 *
 * Path:         /notifications (namespace)
 * Auth:         handshake.auth.token must be a valid access JWT; mismatched
 *               tokens get disconnected immediately.
 * Rooms:        each authenticated socket joins `user:{userId}`. The
 *               NotificationsService emits events to that room via
 *               `emitToUser()`.
 * Client event: `notification` — payload = the full Notification row.
 *
 * CORS comes from the same ALLOWED_ORIGINS env used by the Express adapter.
 */
@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: (origin: string | undefined, cb: (err: Error | null, ok: boolean) => void) => {
      const list = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000')
        .split(',')
        .map((s) => s.trim());
      cb(null, !origin || list.includes(origin));
    },
    credentials: true,
  },
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notifications: NotificationsService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const token =
      (client.handshake.auth?.token as string | undefined) ??
      (client.handshake.headers?.authorization as string | undefined)?.replace(/^Bearer\s+/i, '');
    if (!token) {
      this.logger.debug(`WS rejected — no token (sid=${client.id})`);
      client.disconnect(true);
      return;
    }
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
      if (payload.scope && payload.scope !== 'access') {
        throw new Error('wrong scope');
      }
      client.data.userId = payload.sub;
      await client.join(`user:${payload.sub}`);

      // On connect, push the current unread count so the bell badge can
      // hydrate without an extra REST call.
      const unread = await this.notifications.unreadCount(payload.sub);
      client.emit('unreadCount', unread);

      this.logger.log(`WS connected — userId=${payload.sub} sid=${client.id}`);
    } catch (err) {
      this.logger.debug(`WS rejected — bad token (sid=${client.id}): ${(err as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const userId = client.data?.userId as string | undefined;
    if (userId) {
      this.logger.log(`WS disconnected — userId=${userId} sid=${client.id}`);
    }
  }

  /** Push an event to every live socket belonging to `userId`. */
  emitToUser(userId: string, event: string, payload: unknown): void {
    if (!this.server) return; // gateway not yet ready (early boot)
    this.server.to(`user:${userId}`).emit(event, payload);
  }
}
