import type { JwtPayload } from '@lms/types';
import { Role } from '@lms/types';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { Roles } from '../../common/rbac/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { ListNotificationsDto } from './dto/list-notifications.dto';
import { SendEmailDto } from './dto/send-email.dto';
import { EmailService } from './email.service';
import { NotificationsService, type Paginated } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
  ) {}

  // ----------- READ ------------
  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query() dto: ListNotificationsDto,
  ): Promise<Paginated<unknown>> {
    return this.notifications.list(user.sub, dto);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() user: JwtPayload) {
    const count = await this.notifications.unreadCount(user.sub);
    return { count };
  }

  // ----------- WRITE ------------
  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.notifications.markRead(user.sub, id);
    return { message: 'Đã đánh dấu đã đọc' };
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentUser() user: JwtPayload) {
    return this.notifications.markAllRead(user.sub);
  }

  // ----------- ADMIN — queue email ------------
  /**
   * Internal endpoint to enqueue any transactional email. Exposed only to
   * ADMIN+ so misuse can't come from ordinary users — feature code inside
   * the backend should prefer calling EmailService directly.
   */
  @Post('email')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @HttpCode(HttpStatus.ACCEPTED)
  async enqueueEmail(@Body() dto: SendEmailDto) {
    // The DTO is deliberately loosely-typed (props: Record<string, unknown>)
    // because per-template prop validation lives at render time. Cast
    // through `unknown` to satisfy the discriminated-union input type —
    // any malformed props surface as a job failure, not an HTTP 500.
    const { jobId } = await this.email.enqueue({
      to: dto.to,
      template: dto.template,
      props: dto.props,
    } as unknown as Parameters<typeof this.email.enqueue>[0]);
    return { jobId, queued: true };
  }
}
