import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateQuizDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  /** Seconds. null / omitted = no time limit. */
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(24 * 60 * 60)
  timeLimit?: number;

  @IsOptional()
  @IsBoolean()
  shuffleQuestions?: boolean;

  @IsOptional()
  @IsBoolean()
  showAnswerAfter?: boolean;

  @IsInt()
  @Min(0)
  @Max(100)
  passScore!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxAttempts?: number;
}
