import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';

export interface GoogleUserPayload {
  email: string;
  name: string;
  avatar: string | null;
  googleId: string;
}

/**
 * Google OAuth2 strategy.
 *
 * IMPORTANT: passport-google-oauth20 throws synchronously in its constructor
 * if `clientID` is falsy — that would crash the whole app on boot whenever
 * a dev hasn't filled in Google credentials yet. We work around it with
 * placeholder strings + a warning log. The /auth/google route will still
 * fail at request time (Google rejects the placeholder) but the rest of
 * /auth/* stays usable.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private static readonly logger = new Logger(GoogleStrategy.name);

  constructor(config: ConfigService) {
    const clientID = config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = config.get<string>('GOOGLE_CLIENT_SECRET');
    const callbackURL =
      config.get<string>('GOOGLE_CALLBACK_URL') ??
      'http://localhost:4000/api/v1/auth/google/callback';

    if (!clientID || !clientSecret) {
      GoogleStrategy.logger.warn(
        'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured — /auth/google will not work until you fill them in .env',
      );
    }

    super({
      clientID: clientID || 'not-configured',
      clientSecret: clientSecret || 'not-configured',
      callbackURL,
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(new Error('Google profile is missing email'), undefined);
      return;
    }
    const payload: GoogleUserPayload = {
      email,
      name: profile.displayName || email.split('@')[0]!,
      avatar: profile.photos?.[0]?.value ?? null,
      googleId: profile.id,
    };
    done(null, payload);
  }
}
