import { Controller, Get, Inject, Req, Res, UseGuards } from '@nestjs/common'
import type { Request, Response } from 'express'
import { AccessTokenGuard } from '../auth/access-token.guard'
import { JourneyService } from './journey.service'

@Controller('journey')
@UseGuards(AccessTokenGuard)
export class JourneyController {
  constructor(@Inject(JourneyService) private readonly journey: JourneyService) {}

  @Get()
  async getJourney(
    @Req() req: Request & { subject?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { data, cache } = await this.journey.getJourney(req.subject ?? 'unknown')
    // Not a performance nicety: this header is how the Stage 3 measurement
    // proves the cache is doing anything, rather than taking it on faith.
    res.setHeader('X-Cache', cache)
    return data
  }
}
