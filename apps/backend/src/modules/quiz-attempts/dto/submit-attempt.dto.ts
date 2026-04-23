import { Type } from 'class-transformer';
import { Allow, IsArray, IsString, ValidateNested } from 'class-validator';

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
   * `@Allow()` is required because the app-wide ValidationPipe is configured
   * with `whitelist: true` + `forbidNonWhitelisted: true`, which strips /
   * rejects any DTO field lacking a class-validator decorator. Without it
   * every submission was rejected with `answers.N.property answer should not
   * exist` before the service ran. We can't use a type-specific decorator
   * (`@IsString()` etc.) because the legal shape depends on the referenced
   * Question.type, which requires a DB round-trip — the service does that
   * real shape check before grading.
   */
  @Allow()
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
