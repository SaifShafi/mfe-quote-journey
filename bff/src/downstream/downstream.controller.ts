import { Controller, Get, Inject, UseGuards } from '@nestjs/common'
import { AccessTokenGuard } from '../auth/access-token.guard'
import { AccountService } from './account.service'
import { VehicleService } from './vehicle.service'

/**
 * The two endpoints the host would call directly if there were no
 * aggregator: one request per remote's data. They exist so the "before"
 * half of the round-trip measurement calls something real rather than a
 * number asserted in prose. Nothing in the real page uses these; see
 * host-shell/src/bff.ts and BFF_MODE.
 */
@Controller('downstream')
@UseGuards(AccessTokenGuard)
export class DownstreamController {
  constructor(
    @Inject(VehicleService) private readonly vehicle: VehicleService,
    @Inject(AccountService) private readonly account: AccountService,
  ) {}

  @Get('vehicle')
  getVehicle() {
    return this.vehicle.fetchVehicle()
  }

  @Get('account')
  getAccount() {
    return this.account.fetchPolicy()
  }
}
