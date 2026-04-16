import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, ValidateNested } from 'class-validator';

export class SettingUpdateItem {
  @IsString()
  key!: string;

  // `value` is deliberately typed as `unknown` — the service layer validates
  // the shape against the whitelist. class-validator can't pre-check it
  // without knowing the key, so we accept anything and let the service
  // coerce and reject bad values.
  value!: unknown;
}

export class UpdateSettingsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50, { message: 'Tối đa 50 setting mỗi request' })
  @ValidateNested({ each: true })
  @Type(() => SettingUpdateItem)
  updates!: SettingUpdateItem[];
}
