import { IsJWT, IsString, Length } from 'class-validator';

export class Verify2FADto {
  @IsJWT({ message: 'tempToken không hợp lệ' })
  tempToken!: string;

  @IsString()
  @Length(6, 6, { message: 'OTP phải gồm 6 chữ số' })
  otp!: string;
}
