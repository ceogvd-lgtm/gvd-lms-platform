import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RevokeCertificateDto {
  @IsString()
  @IsNotEmpty({ message: 'Phải nhập lý do thu hồi' })
  @MaxLength(500)
  reason!: string;
}
