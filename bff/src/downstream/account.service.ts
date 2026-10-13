import { Injectable } from '@nestjs/common'

export interface PolicyRecord {
  reference: string
  cover: string
  renewal: string
  excess: string
}

/** Stands in for a policy-data service. See vehicle.service.ts for the delay. */
@Injectable()
export class AccountService {
  async fetchPolicy(): Promise<PolicyRecord> {
    await delay(150)
    return {
      reference: 'QJ-4417-02',
      cover: 'Comprehensive',
      renewal: '14 March 2027',
      excess: '250',
    }
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
