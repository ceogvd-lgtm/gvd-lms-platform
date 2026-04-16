import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SendReminderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200, { message: 'Tối đa 200 học viên mỗi lần' })
  @IsString({ each: true })
  studentIds!: string[];

  @IsString()
  courseId!: string;

  /** Optional custom message — currently logged in audit only; the email
   *  template uses standardised copy from `at-risk-alert.tsx`. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
