import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectContentDto {
  @IsString()
  @IsNotEmpty({ message: 'Phải nhập lý do từ chối' })
  @MaxLength(500)
  reason!: string;
}
