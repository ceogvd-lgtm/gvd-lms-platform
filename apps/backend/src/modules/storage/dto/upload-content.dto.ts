import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum ContentKindDto {
  SCORM = 'SCORM',
  PPT = 'PPT',
  VIDEO = 'VIDEO',
  WEBGL = 'WEBGL',
}

export class UploadContentDto {
  @IsEnum(ContentKindDto, {
    message: 'contentType phải là SCORM | PPT | VIDEO | WEBGL',
  })
  contentType!: ContentKindDto;

  /** Required for WEBGL — extraction target. For other kinds, optional. */
  @IsOptional()
  @IsString()
  lessonId?: string;
}
