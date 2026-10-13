import { Module } from '@nestjs/common'
import { AuthModule } from './auth/auth.module'
import { DownstreamModule } from './downstream/downstream.module'
import { JourneyModule } from './journey/journey.module'

@Module({
  imports: [AuthModule, DownstreamModule, JourneyModule],
})
export class AppModule {}
