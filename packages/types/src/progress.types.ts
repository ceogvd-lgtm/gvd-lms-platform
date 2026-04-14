/**
 * Progress & Enrollment types.
 */
import type { ID, Timestamped } from './common.types';

export enum EnrollmentStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
  DROPPED = 'DROPPED',
}

export interface CourseEnrollment extends Timestamped {
  id: ID;
  userId: ID;
  courseId: ID;
  status: EnrollmentStatus;
  progressPercent: number;
  enrolledAt: Date;
  completedAt: Date | null;
}

export interface LessonProgress extends Timestamped {
  id: ID;
  userId: ID;
  lessonId: ID;
  courseId: ID;
  isCompleted: boolean;
  lastPositionSeconds: number;
  completedAt: Date | null;
}
