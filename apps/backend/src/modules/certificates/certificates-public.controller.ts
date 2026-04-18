import { Controller, Get, Param } from '@nestjs/common';

import { Public } from '../auth/decorators/public.decorator';

import { CertificatesService } from './certificates.service';

/**
 * Phase 16 — public (no-auth) certificate routes.
 *
 * Split into its own controller because the ADMIN-scoped one uses
 * `@Roles(ADMIN, SUPER_ADMIN)` at the class level; mixing a public
 * route under the same class would require overriding that guard
 * per-method which is easy to miss.
 */
@Controller('certificates')
export class CertificatesPublicController {
  constructor(private readonly certificates: CertificatesService) {}

  /**
   * GET /api/v1/certificates/verify/:code
   *
   * Called by the Next.js `/verify/[code]` SSR page. Returns the
   * minimal public shape — no PII beyond name + course title + grade.
   */
  @Get('verify/:code')
  @Public()
  verify(@Param('code') code: string) {
    return this.certificates.verifyByCode(code);
  }
}
