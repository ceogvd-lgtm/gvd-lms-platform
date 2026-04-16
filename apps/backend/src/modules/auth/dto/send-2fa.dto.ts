import { IsJWT } from 'class-validator';

export class Send2FADto {
  @IsJWT({ message: 'tempToken không hợp lệ' })
  tempToken!: string;
}
