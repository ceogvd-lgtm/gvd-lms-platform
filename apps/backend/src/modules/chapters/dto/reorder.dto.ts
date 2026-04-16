import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class ReorderDto {
  /** New 0-based position of the item within its parent. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  newOrder!: number;
}
