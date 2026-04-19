import { Difficulty, QuestionType } from '@lms/types';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Query parameters accepted by `GET /admin/questions` (Phase 18).
 *
 * Tách riêng khỏi `ListQuestionsDto` vì admin-scope có một filter
 * `instructorId` mà listing thường không dùng (instructor thường chỉ thấy
 * câu của mình, nên filter này vô nghĩa). Giữ DTO cũ nguyên vẹn để
 * tránh ảnh hưởng endpoint `/questions` đang chạy.
 */
export class ListAdminQuestionsDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsEnum(QuestionType)
  type?: QuestionType;

  @IsOptional()
  @IsEnum(Difficulty)
  difficulty?: Difficulty;

  /** Lọc theo user tạo câu hỏi (giảng viên / admin). */
  @IsOptional()
  @IsString()
  instructorId?: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
