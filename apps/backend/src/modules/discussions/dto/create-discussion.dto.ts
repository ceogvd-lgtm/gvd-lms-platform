import { IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDiscussionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  mentionUserIds?: string[];
}

export class CreateReplyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content!: string;
}
