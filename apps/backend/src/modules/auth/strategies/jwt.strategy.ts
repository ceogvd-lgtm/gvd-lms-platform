import type { JwtPayload } from '@lms/types';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) throw new Error('JWT_SECRET is not configured');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /** Passport calls this after verifying signature + expiry. */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // Only 'access' scope is acceptable for protected routes.
    // 2FA temp tokens and refresh tokens must NOT unlock JwtAuthGuard.
    if (payload.scope && payload.scope !== 'access') {
      throw new UnauthorizedException('Invalid token scope');
    }
    return payload;
  }
}
