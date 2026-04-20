import { IsOptional, IsString } from 'class-validator';

/**
 * Phase 18 — Admin gán / gỡ department cho user (cho flow auto-enroll).
 * `departmentId` nullable: admin có thể clear bằng cách gửi `null`.
 */
export class UpdateDepartmentDto {
  @IsOptional()
  @IsString()
  departmentId?: string | null;
}
