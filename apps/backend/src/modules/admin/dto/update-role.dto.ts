import { Role } from '@lms/types';
import { IsIn } from 'class-validator';

const ASSIGNABLE_ROLES: Role[] = [Role.ADMIN, Role.INSTRUCTOR, Role.STUDENT, Role.SUPER_ADMIN];

export class UpdateRoleDto {
  @IsIn(ASSIGNABLE_ROLES, { message: 'Role không hợp lệ' })
  role!: Role;
}
