import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * DTO cho PATCH /users/me — user đang đăng nhập tự sửa hồ sơ bản thân.
 *
 * Cố ý TÁCH BIỆT với AdminController's update-role.dto / block-user.dto —
 * những DTO kia cho phép đổi role/blocked trên user khác, còn DTO này
 * chỉ cho đổi các field an toàn của chính mình.
 *
 * Bất kỳ field lạ nào trong body (email, role, password, isBlocked, …)
 * đều bị `ValidationPipe` strip nhờ `whitelist: true +
 * forbidNonWhitelisted: true` (global config).
 *
 * `avatar` cố ý dùng `IsString` thay vì `IsUrl` vì URL của chúng ta là
 * **relative** (VD `/minio/avatars/uid.webp`) — frontend gọi
 * `POST /upload/avatar` lấy URL rồi PATCH lên đây để chốt.
 */
export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1, { message: 'Tên không được để trống' })
  @MaxLength(100, { message: 'Tên tối đa 100 ký tự' })
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'URL avatar quá dài' })
  avatar?: string;
}
