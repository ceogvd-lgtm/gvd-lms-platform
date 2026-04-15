import { LessonType } from '@lms/database';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateLessonDto {
  @IsString()
  chapterId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @IsEnum(LessonType, { message: 'type phải là THEORY hoặc PRACTICE' })
  type!: LessonType;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
