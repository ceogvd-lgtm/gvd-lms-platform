import { Type } from 'class-transformer';
import { IsArray, IsString, ValidateNested } from 'class-validator';

class AnswerItem {
  @IsString()
  questionId!: string;

  /**
   * Per-type shape:
   *   SINGLE_CHOICE / TRUE_FALSE  → number (0-based index of the option)
   *   MULTI_CHOICE                → number[] (indices, order-independent)
   *   FILL_BLANK                  → string (compared case-insensitive + trim)
   *
   * We keep this `unknown` in validation because class-validator can't
   * discriminate on the enum type of the referenced question without a
   * DB round-trip — the service does the real shape check before grading.
   */
  answer!: unknown;
}

export class SubmitAttemptDto {
  @IsString()
  quizId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerItem)
  answers!: AnswerItem[];
}
