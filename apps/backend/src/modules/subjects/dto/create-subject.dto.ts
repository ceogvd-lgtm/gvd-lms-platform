import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateSubjectDto {
  @IsString()
  departmentId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(30)
  @Matches(/^[A-Z0-9_-]+$/, {
    message: 'code chỉ gồm chữ HOA, số, dấu - hoặc _',
  })
  code!: string;

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
