import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { PASSWORD_REGEX } from './register.dto';

/**
 * DTO cho POST /auth/reset-password.
 *
 * User bấm link trong email → vào /reset-password?token=xxx → nhập mật khẩu mới.
 * Token có TTL 1h, được cấp khi user gọi /auth/forgot-password.
 */
export class ResetPasswordDto {
  @IsString()
  @MinLength(1, { message: 'Token không được trống' })
  @MaxLength(256)
  token!: string;

  @IsString()
  @MinLength(8, { message: 'Mật khẩu mới phải có ít nhất 8 ký tự' })
  @MaxLength(128)
  @Matches(PASSWORD_REGEX, {
    message: 'Mật khẩu mới phải có ít nhất 1 chữ hoa, 1 số và 1 ký tự đặc biệt',
  })
  newPassword!: string;
}
