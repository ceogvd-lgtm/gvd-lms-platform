import { IsBoolean } from 'class-validator';

export class BlockUserDto {
  @IsBoolean()
  blocked!: boolean;
}
