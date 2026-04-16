import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';

import { CreateQuestionDto } from './create-question.dto';

/**
 * Import endpoint payload. Two shapes are supported:
 *
 *   1. `{ questions: [CreateQuestionDto, ...] }` — frontend parses Excel
 *      with SheetJS, validates row-by-row, then POSTs validated objects.
 *
 *   2. `{ preview: true, questions: [...] }` — the server does the same
 *      validation but does NOT persist. Frontend uses this for dry-run
 *      before the user clicks "Confirm import".
 *
 * We cap at 1000 rows per request to keep transactions reasonable.
 */
export class ImportQuestionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  @ArrayMaxSize(1000)
  questions!: CreateQuestionDto[];

  @IsOptional()
  @IsString()
  defaultCourseId?: string;

  @IsOptional()
  @IsString()
  defaultDepartmentId?: string;
}
