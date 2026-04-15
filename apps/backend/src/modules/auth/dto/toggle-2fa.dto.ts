import { IsBoolean, IsString, MinLength } from 'class-validator';

export class Toggle2FADto {
  @IsString()
  @MinLength(1)
  password!: string;

  @IsBoolean()
  enable!: boolean;
}
