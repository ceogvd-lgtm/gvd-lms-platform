import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Status transitions — see CoursesService.assertStatusTransition() for the
 * full validation table. A client only needs to say where it wants to go;
 * the server computes the next state from the current one + role.
 */
export const STATUS_ACTIONS = [
  'SUBMIT', // INSTRUCTOR: DRAFT → PENDING_REVIEW
  'APPROVE', // ADMIN+:     PENDING_REVIEW → PUBLISHED
  'REJECT', // ADMIN+:     PENDING_REVIEW → DRAFT
  'ARCHIVE', // owner or ADMIN+
  'UNARCHIVE', // ADMIN+:   ARCHIVED → DRAFT
] as const;

export type StatusAction = (typeof STATUS_ACTIONS)[number];

export class UpdateStatusDto {
  @IsIn(STATUS_ACTIONS)
  action!: StatusAction;

  /** Optional rejection / archive reason — recorded in AuditLog. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
