import { Injectable } from '@nestjs/common'

export interface VehicleRecord {
  registration: string
  year: string
  mileage: string
}

/**
 * Stands in for a vehicle-data service this team does not own. The artificial
 * delay is the point: without it every round-trip measurement in this stage
 * would be noise, because localhost round trips a few KB of JSON in under a
 * millisecond and the aggregation story has nothing to show.
 */
@Injectable()
export class VehicleService {
  async fetchVehicle(): Promise<VehicleRecord> {
    await delay(120)
    return { registration: 'AB12 CDE', year: '2019', mileage: '8000' }
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
