import { Inject, Injectable } from '@nestjs/common'
import { TtlCache } from '../cache/ttl-cache'
import { AccountService, type PolicyRecord } from '../downstream/account.service'
import { VehicleService, type VehicleRecord } from '../downstream/vehicle.service'

export interface JourneyData {
  vehicle: VehicleRecord
  policy: PolicyRecord
}

export type JourneyResult = { data: JourneyData; cache: 'HIT' | 'MISS' }

// Short enough that the measurement script can prove a hit inside one test
// run without a real wait, long enough that reloading the page a moment
// after the first load does not repeat both downstream calls.
const JOURNEY_CACHE_TTL_MS = 5000

/**
 * The whole BFF boundary in one file: fetch what the two remotes need, in
 * parallel, shape it into one response, cache it. Nothing here decides a
 * premium or checks eligibility. Those are business rules and they belong to
 * whatever service owns that domain, not to a layer whose job is shaping
 * responses for one page.
 */
@Injectable()
export class JourneyService {
  private readonly cache = new TtlCache<JourneyData>(JOURNEY_CACHE_TTL_MS)

  constructor(
    @Inject(VehicleService) private readonly vehicle: VehicleService,
    @Inject(AccountService) private readonly account: AccountService,
  ) {}

  async getJourney(subject: string): Promise<JourneyResult> {
    const cached = this.cache.get(subject)
    if (cached) {
      return { data: cached, cache: 'HIT' }
    }

    // In parallel: this is the one thing the browser could not do for free.
    // Two sequential fetches cost 120ms + 150ms; these run concurrently on
    // the server and cost max(120ms, 150ms), on top of a single round trip
    // instead of two.
    const [vehicle, policy] = await Promise.all([
      this.vehicle.fetchVehicle(),
      this.account.fetchPolicy(),
    ])

    const data: JourneyData = { vehicle, policy }
    this.cache.set(subject, data)
    return { data, cache: 'MISS' }
  }
}
