import { Type } from 'class-transformer';
import { IsArray, IsString, ValidateNested } from 'class-validator';

class AnswerItem {
  @IsString()
  questionId!: string;

  /**
   * Per-type shape:
   *   SINGLE_CHOICE / TRUE_FALSE  → string (the chosen option's `id`,
   *                                  matching Question.options[i].id +
   *                                  Question.correctAnswer entries)
   *   MULTI_CHOICE                → string[] (option ids, order-independent)
   *   FILL_BLANK                  → string (compared case-insensitive + trim)
   *
   * Option ids look like `opt_cd0d38ef588a0c99` — see
   * `questions.service.ts#validateAndNormalizeOptions`. Earlier drafts
   * documented numeric indices; the shipping schema uses ids.
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
