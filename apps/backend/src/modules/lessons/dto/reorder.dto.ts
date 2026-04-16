import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class ReorderLessonDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  newOrder!: number;
}
