import type { JwtPayload } from '@lms/types';
import { Body, Controller, Get, Patch } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';

import { UpdateMeDto } from './dto/update-me.dto';
import { UsersService } from './users.service';

/**
 * Self-service endpoints cho chính user đang đăng nhập. Áp mọi role:
 * STUDENT / INSTRUCTOR / ADMIN / SUPER_ADMIN.
 *
 * Controller này cố ý tách khỏi AdminController (ở `/admin/users/*`) —
 * nơi SUPER_ADMIN thao tác trên user khác. Khi 2 controller cùng mount
 * dưới tiền tố `/users`, quy ước là đặt các route tĩnh (`/users/me`)
 * TRƯỚC các route có tham số (`/users/:id`) để NestJS match đúng.
 * Hiện tại chỉ có `/users/me` ở đây — giữ convention phòng khi sau này
 * mở thêm `GET /users/:id` public-ish (VD xem profile giảng viên).
 *
 * JwtAuthGuard + RolesGuard đã đăng ký global trong AppModule (APP_GUARD)
 * nên KHÔNG cần thêm `@UseGuards(JwtAuthGuard)` ở đây. Không dùng @Roles
 * → mọi role authenticated đều vào được.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Patch('me')
  updateMe(@CurrentUser() user: JwtPayload, @Body() dto: UpdateMeDto) {
    return this.users.updateMe(user.sub, dto);
  }

  @Get('me')
  getMe(@CurrentUser() user: JwtPayload) {
    return this.users.getMe(user.sub);
  }
}
