import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * One answer option inside a question.
 * For TRUE_FALSE: we require exactly two options with ids `'true'` / `'false'`.
 * For FILL_BLANK: every option with `isCorrect === true` is an accepted answer;
 * comparison is case-insensitive + whitespace-trimmed at grading time.
 *
 * `id` is optional on create — server assigns a stable cuid so the frontend
 * drag-drop / reorder flow never relies on the array index.
 */
export class QuestionOptionDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  text!: string;

  @IsBoolean()
  isCorrect!: boolean;
}
