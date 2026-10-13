import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { AccountService } from './account.service'
import { DownstreamController } from './downstream.controller'
import { VehicleService } from './vehicle.service'

@Module({
  imports: [AuthModule],
  controllers: [DownstreamController],
  providers: [VehicleService, AccountService],
  exports: [VehicleService, AccountService],
})
export class DownstreamModule {}
