import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

export class CreateCourseDto {
  @IsString()
  subjectId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  thumbnailUrl?: string;
}
