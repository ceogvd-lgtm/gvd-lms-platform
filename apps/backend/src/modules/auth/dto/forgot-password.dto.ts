import { IsEmail, MaxLength } from 'class-validator';

/**
 * DTO cho POST /auth/forgot-password.
 *
 * User nhập email để yêu cầu đặt lại mật khẩu. Backend sẽ gửi email
 * chứa link reset (TTL 1h, lưu token trong Redis). Trả về message
 * giống nhau dù email có tồn tại hay không — tránh email enumeration.
 */
export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(255)
  email!: string;
}
