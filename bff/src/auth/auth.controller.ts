import { Controller, Inject, Post, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import { AuthService } from './auth.service'

const REFRESH_COOKIE = 'refresh_token'
// Scoping the cookie to the one path that reads it means the browser does not
// attach it to /journey or anywhere else. A cookie sent on every request to
// this origin is a bigger blast radius than the refresh flow needs.
const REFRESH_COOKIE_PATH = '/auth/refresh'
const REFRESH_COOKIE_MAX_AGE_MS = 60 * 60 * 1000

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('session')
  startSession(@Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken } = this.auth.startSession()
    this.setRefreshCookie(res, refreshToken)
    return { accessToken }
  }

  @Post('refresh')
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const presented = (req.cookies as Record<string, string> | undefined)?.[
      REFRESH_COOKIE
    ]
    const { accessToken, refreshToken } = this.auth.refresh(presented)
    this.setRefreshCookie(res, refreshToken)
    return { accessToken }
  }

  private setRefreshCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      // 'lax' rather than 'none' because host and bff are same-site
      // (localhost, different ports) and this never needs to cross a real
      // third-party boundary, so there is no reason to also require 'secure'
      // on a plain-http dev server.
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    })
  }
}
