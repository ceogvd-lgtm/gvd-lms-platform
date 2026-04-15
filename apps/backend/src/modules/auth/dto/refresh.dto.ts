import { IsJWT } from 'class-validator';

export class RefreshDto {
  @IsJWT({ message: 'refreshToken không hợp lệ' })
  refreshToken!: string;
}
