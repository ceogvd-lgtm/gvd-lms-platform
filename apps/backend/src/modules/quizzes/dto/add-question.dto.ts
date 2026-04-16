import { IsArray, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class AddQuestionDto {
  @IsString()
  questionId!: string;

  /** Override of the question's default point value within this quiz. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  points?: number;
}

export class AddQuestionsBulkDto {
  @IsArray()
  @IsString({ each: true })
  questionIds!: string[];
}

export class ReorderQuestionsDto {
  /** Ordered list of QuizQuestion ids (not QuestionBank ids). */
  @IsArray()
  @IsString({ each: true })
  orderedIds!: string[];
}

export class RandomPickDto {
  /** How many questions to pick from the filtered pool. */
  @IsInt()
  @Min(1)
  @Max(200)
  count!: number;

  /** Optional filter forwarded to the question list query. */
  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  difficulty?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  courseId?: string;
}
