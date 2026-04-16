import { Difficulty, QuestionType } from '@lms/types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { QuestionOptionDto } from './question-option.dto';

export class CreateQuestionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  question!: string;

  @IsEnum(QuestionType, {
    message: 'type phải là SINGLE_CHOICE/MULTI_CHOICE/TRUE_FALSE/FILL_BLANK',
  })
  type!: QuestionType;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  options!: QuestionOptionDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  explanation?: string;

  @IsOptional()
  @IsEnum(Difficulty)
  difficulty?: Difficulty;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  tags?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  points?: number;

  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;
}
