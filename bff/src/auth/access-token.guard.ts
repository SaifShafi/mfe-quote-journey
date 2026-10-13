import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common'
import type { Request } from 'express'
import { AuthService } from './auth.service'

/**
 * Every route the host calls on behalf of a journey goes through this guard.
 * It does not carry any business rule, only "is there a valid access token",
 * which is the line Stage 3 draws around what belongs in a BFF.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>()
    const subject = this.auth.verifyAccessToken(req.headers.authorization)
    // Available to the handler via req.subject if a route ever needs it.
    // Nothing in this stage does; the aggregator is not scoped per user yet.
    ;(req as Request & { subject?: string }).subject = subject
    return true
  }
}
