/**
 * Course / Chapter / Lesson types.
 */
import type { ID, Timestamped, SoftDeletable } from './common.types';

export enum LessonType {
  VIDEO = 'VIDEO',
  ARTICLE = 'ARTICLE',
  QUIZ = 'QUIZ',
  ASSIGNMENT = 'ASSIGNMENT',
  UNITY_3D = 'UNITY_3D',
  INTERACTIVE = 'INTERACTIVE',
}

export enum CourseStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export interface Course extends Timestamped, SoftDeletable {
  id: ID;
  title: string;
  slug: string;
  description: string;
  thumbnailUrl: string | null;
  status: CourseStatus;
  instructorId: ID;
  categoryId: ID | null;
  level: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
  durationMinutes: number;
  enrollmentCount: number;
}

export interface Chapter extends Timestamped {
  id: ID;
  courseId: ID;
  title: string;
  order: number;
  description: string | null;
}

export interface Lesson extends Timestamped, SoftDeletable {
  id: ID;
  chapterId: ID;
  title: string;
  type: LessonType;
  order: number;
  contentUrl: string | null;
  contentText: string | null;
  durationSeconds: number;
  isPreviewable: boolean;
}
