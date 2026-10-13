import { Injectable, UnauthorizedException } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import jwt from 'jsonwebtoken'

/**
 * Demo-only session issuance. There is no password here because there is no
 * user system yet: Stage 5 is OIDC through this same BFF, and this module is
 * deliberately shaped so that stage only has to replace how a session starts,
 * not how it is held afterwards.
 *
 * The split that matters: the ACCESS token is a JWT the browser can read and
 * send as a header, short-lived so a leaked copy is only useful briefly. The
 * REFRESH token is an opaque, unguessable string the server can revoke,
 * long-lived, and never readable by JavaScript because it only ever travels
 * as an httpOnly cookie. A remote never sees either: only the host calls this
 * service, and the host hands remotes resolved data, not credentials.
 */
const ACCESS_TOKEN_TTL_SECONDS = 10
const REFRESH_TOKEN_TTL_MS = 60 * 60 * 1000

// A fixed secret and a fixed demo subject are the honest shortcut for a BFF
// with no real identity provider in front of it yet. Rotating this secret
// invalidates every outstanding token, which is correct: there is nowhere
// durable these tokens need to survive a BFF restart.
const ACCESS_TOKEN_SECRET = 'mfe-quote-journey-demo-secret-do-not-reuse'
const DEMO_SUBJECT = 'demo-user'

interface RefreshRecord {
  subject: string
  expiresAt: number
}

@Injectable()
export class AuthService {
  // Keyed by the opaque refresh token itself. Revoking a session means
  // deleting its entry, which rotation below does to the token it replaces.
  private readonly refreshTokens = new Map<string, RefreshRecord>()

  startSession(): { accessToken: string; refreshToken: string } {
    const refreshToken = this.issueRefreshToken(DEMO_SUBJECT)
    const accessToken = this.signAccessToken(DEMO_SUBJECT)
    return { accessToken, refreshToken }
  }

  /**
   * Rotates the refresh token on every use: the old one is deleted and a new
   * one issued alongside the new access token. A refresh token that still
   * works after being used once is a replay window: if it is ever stolen, the
   * thief and the legitimate browser would both keep refreshing. Rotation
   * means the first one to use a stolen token invalidates it for the other.
   */
  refresh(refreshToken: string | undefined): {
    accessToken: string
    refreshToken: string
  } {
    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token presented')
    }
    const record = this.refreshTokens.get(refreshToken)
    this.refreshTokens.delete(refreshToken)
    if (!record || Date.now() >= record.expiresAt) {
      throw new UnauthorizedException('Refresh token is invalid or expired')
    }
    const nextRefreshToken = this.issueRefreshToken(record.subject)
    const accessToken = this.signAccessToken(record.subject)
    return { accessToken, refreshToken: nextRefreshToken }
  }

  /** Throws if the token is missing, malformed or expired. Returns the subject. */
  verifyAccessToken(authorizationHeader: string | undefined): string {
    const token = authorizationHeader?.startsWith('Bearer ')
      ? authorizationHeader.slice('Bearer '.length)
      : undefined
    if (!token) {
      throw new UnauthorizedException('Missing bearer token')
    }
    try {
      const payload = jwt.verify(token, ACCESS_TOKEN_SECRET) as { sub: string }
      return payload.sub
    } catch {
      throw new UnauthorizedException('Access token is invalid or expired')
    }
  }

  private issueRefreshToken(subject: string): string {
    const token = randomBytes(32).toString('hex')
    this.refreshTokens.set(token, {
      subject,
      expiresAt: Date.now() + REFRESH_TOKEN_TTL_MS,
    })
    return token
  }

  private signAccessToken(subject: string): string {
    return jwt.sign({}, ACCESS_TOKEN_SECRET, {
      subject,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    })
  }
}
