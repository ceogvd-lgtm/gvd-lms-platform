import { IsInt, IsOptional, IsString, IsUrl, MaxLength, Min, MinLength } from 'class-validator';

export class UpdateSubjectDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  thumbnailUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
