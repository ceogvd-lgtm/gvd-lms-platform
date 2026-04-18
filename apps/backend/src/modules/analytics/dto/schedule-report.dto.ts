import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsOptional } from 'class-validator';

export class ScheduleReportDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  recipients!: string[];

  /** If true, fire once immediately in addition to registering the subscription. */
  @IsOptional()
  sendNow?: boolean;
}
