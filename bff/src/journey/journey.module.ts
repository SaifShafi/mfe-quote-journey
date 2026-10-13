import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { DownstreamModule } from '../downstream/downstream.module'
import { JourneyController } from './journey.controller'
import { JourneyService } from './journey.service'

@Module({
  imports: [AuthModule, DownstreamModule],
  controllers: [JourneyController],
  providers: [JourneyService],
})
export class JourneyModule {}
