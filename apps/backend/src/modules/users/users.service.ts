import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../common/prisma/prisma.service';

import type { UpdateMeDto } from './dto/update-me.dto';

/**
 * Self-service user profile ops. Song song với AdminService (quản lý user
 * khác) — service này CHỈ thao tác trên user hiện tại (`userId` từ JWT).
 *
 * Không đụng vào:
 *   - password (đã có /auth/change-password)
 *   - email (require verification lại — phase sau)
 *   - role (LAW 1/2/3/4 — chỉ SUPER_ADMIN qua /admin/users/:id/role)
 *   - isBlocked (chỉ ADMIN+ qua /admin/users/:id/block)
 *   - is2FAEnabled (qua /auth/2fa/toggle)
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly selectMe = {
    id: true,
    email: true,
    name: true,
    role: true,
    avatar: true,
    createdAt: true,
    emailVerified: true,
    is2FAEnabled: true,
  } as const;

  /**
   * Trả hồ sơ đầy đủ cho user đang đăng nhập. So với /auth/me, thêm field
   * `createdAt` để frontend hiển thị "Ngày tham gia". Không nhạy cảm hơn
   * /auth/me — cùng JwtAuthGuard, cùng user.sub.
   */
  async getMe(userId: string) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: this.selectMe,
    });
    if (!user) throw new NotFoundException('Không tìm thấy tài khoản');
    return user;
  }

  /**
   * Cập nhật hồ sơ. Hiện cho đổi `name` + `avatar` — các field khác có
   * flow riêng (đổi mật khẩu, 2FA, email verify). Luôn trả về hồ sơ đầy
   * đủ sau update để frontend đồng bộ Zustand store trong 1 request.
   *
   * Chỉ field được DTO cho phép mới đi vào `data` — bất kỳ field khác
   * kể cả được truyền kèm vẫn bị `ValidationPipe whitelist` strip trước
   * khi tới đây.
   */
  async updateMe(userId: string, dto: UpdateMeDto) {
    const data: { name?: string; avatar?: string } = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.avatar !== undefined) data.avatar = dto.avatar;

    // Không có field hợp lệ → trả profile hiện tại để UI không lỗi.
    if (Object.keys(data).length === 0) {
      return this.getMe(userId);
    }

    return this.prisma.client.user.update({
      where: { id: userId },
      data,
      select: this.selectMe,
    });
  }
}
