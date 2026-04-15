'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@lms/ui';

import { UploadFlow } from '@/components/upload/upload-flow';

const MB = 1024 * 1024;

/**
 * Phase 06 demo page — exercises each /upload/* endpoint.
 * Accessible at /upload-demo. Not linked in the sidebar by default.
 */
export default function UploadDemoPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">File Storage</h1>
        <p className="mt-1 text-sm text-muted">
          Phase 06 demo — thử từng loại upload. Các hạn chế size/MIME được enforce cả client +
          server.
        </p>
      </div>

      <Tabs defaultValue="avatar">
        <TabsList>
          <TabsTrigger value="avatar">Avatar</TabsTrigger>
          <TabsTrigger value="thumbnail">Thumbnail</TabsTrigger>
          <TabsTrigger value="attachment">Attachment PDF</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
        </TabsList>

        <TabsContent value="avatar">
          <Card>
            <CardHeader>
              <CardTitle>Upload Avatar</CardTitle>
              <CardDescription>
                Ảnh đại diện user · max 5 MB · jpg/png/webp · backend resize về 200×200 webp
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UploadFlow
                endpoint="/upload/avatar"
                accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] }}
                maxSize={5 * MB}
                submitLabel="Tải avatar"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="thumbnail">
          <Card>
            <CardHeader>
              <CardTitle>Upload Thumbnail</CardTitle>
              <CardDescription>
                Thumbnail khoá học · max 10 MB · jpg/png · backend resize về 800×450 webp ·
                INSTRUCTOR+
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UploadFlow
                endpoint="/upload/thumbnail"
                accept={{ 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'] }}
                maxSize={10 * MB}
                submitLabel="Tải thumbnail"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attachment">
          <Card>
            <CardHeader>
              <CardTitle>Upload Attachment</CardTitle>
              <CardDescription>
                Tài liệu PDF đính kèm bài giảng · max 50 MB · PDF only · INSTRUCTOR+
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UploadFlow
                endpoint="/upload/attachment"
                accept={{ 'application/pdf': ['.pdf'] }}
                maxSize={50 * MB}
                submitLabel="Tải PDF"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="content">
          <Card>
            <CardHeader>
              <CardTitle>Upload Content</CardTitle>
              <CardDescription>
                SCORM / PPT / Video / WebGL · demo field cố định contentType=VIDEO + max 100 MB
                (practical cap do memory-buffered multer path — xem TODO Phase 07 cho
                direct-to-MinIO multipart).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UploadFlow
                endpoint="/upload/content"
                accept={{
                  'video/mp4': ['.mp4'],
                  'video/webm': ['.webm'],
                  'application/zip': ['.zip'],
                }}
                maxSize={100 * MB}
                extraFields={{ contentType: 'VIDEO' }}
                submitLabel="Tải content"
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
