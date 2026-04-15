import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { PASSWORD_REGEX } from '../../auth/dto/register.dto';

export class CreateAdminDto {
  @IsEmail({}, { message: 'Email không hợp lệ' })
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(2, { message: 'Họ tên phải có ít nhất 2 ký tự' })
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(8, { message: 'Mật khẩu phải có ít nhất 8 ký tự' })
  @MaxLength(128)
  @Matches(PASSWORD_REGEX, {
    message: 'Mật khẩu phải có ít nhất 1 chữ hoa, 1 số và 1 ký tự đặc biệt',
  })
  password!: string;
}
