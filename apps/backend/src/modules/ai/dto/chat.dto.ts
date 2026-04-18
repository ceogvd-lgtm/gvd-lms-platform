import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * One turn in the chat history. The Gemini SDK uses "user" / "model"
 * — we enforce those literals so the controller can't accept garbage
 * that would later throw inside the SDK call.
 */
export class ChatHistoryTurnDto {
  @IsIn(['user', 'model'])
  role!: 'user' | 'model';

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content!: string;
}

export class ChatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  lessonId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ChatHistoryTurnDto)
  history?: ChatHistoryTurnDto[];

  @IsOptional()
  @IsString()
  sessionId?: string;
}

export class RateMessageDto {
  @IsInt()
  @IsIn([1, -1])
  rating!: 1 | -1;
}

export class IndexLessonDto {
  @IsString()
  @MinLength(1)
  lessonId!: string;
}
