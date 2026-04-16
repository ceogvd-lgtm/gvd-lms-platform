import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsString } from 'class-validator';

export class BulkBlockDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200, { message: 'Tối đa 200 user mỗi lần' })
  @IsString({ each: true })
  ids!: string[];

  @IsBoolean()
  blocked!: boolean;
}
