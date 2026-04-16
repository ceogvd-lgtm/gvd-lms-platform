import { IsOptional, IsString } from 'class-validator';

export class CreateEnrollmentDto {
  @IsString()
  courseId!: string;

  /** Optional — ADMIN+ can enroll someone else; STUDENT always enrolls self. */
  @IsOptional()
  @IsString()
  studentId?: string;
}
