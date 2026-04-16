import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateChapterDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
