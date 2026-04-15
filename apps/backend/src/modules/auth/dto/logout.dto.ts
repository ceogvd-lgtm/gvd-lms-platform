import { IsJWT } from 'class-validator';

export class LogoutDto {
  @IsJWT({ message: 'refreshToken không hợp lệ' })
  refreshToken!: string;
}
