import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

/**
 * Body for `DELETE /admin/questions/bulk` (Phase 18).
 *
 * Admin-only. Server re-checks mọi id có trong body:
 *   - Câu hỏi đang dùng trong quiz → 400 (kèm danh sách id bị từ chối)
 *   - Câu hỏi không tồn tại → bỏ qua
 *   - Còn lại → hard delete + audit log từng câu
 */
export class BulkDeleteQuestionsDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Phải chọn ít nhất 1 câu hỏi' })
  @ArrayMaxSize(200, { message: 'Tối đa 200 câu mỗi lần' })
  @IsString({ each: true })
  ids!: string[];
}
