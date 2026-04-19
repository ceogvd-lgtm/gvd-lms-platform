import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { PASSWORD_REGEX } from './register.dto';

/**
 * DTO cho POST /auth/change-password.
 *
 * Dùng khi user đang đăng nhập muốn đổi mật khẩu. Phải nhập mật khẩu
 * cũ để chống session-hijack (attacker có JWT nhưng không biết password
 * không đổi được).
 *
 * `newPassword` tái sử dụng cùng regex với register — 8+ ký tự, 1 hoa,
 * 1 số, 1 ký tự đặc biệt.
 */
export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: 'Mật khẩu cũ không được trống' })
  @MaxLength(128)
  oldPassword!: string;

  @IsString()
  @MinLength(8, { message: 'Mật khẩu mới phải có ít nhất 8 ký tự' })
  @MaxLength(128)
  @Matches(PASSWORD_REGEX, {
    message: 'Mật khẩu mới phải có ít nhất 1 chữ hoa, 1 số và 1 ký tự đặc biệt',
  })
  newPassword!: string;
}
