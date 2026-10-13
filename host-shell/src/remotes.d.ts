// The host has no build-time knowledge of its remotes, so TypeScript needs to be
// told the shape of each contract by hand. This file IS the contract: if a
// remote changes its export and nobody updates this, the break only shows up at
// runtime in the composed app. That gap is the cost of runtime composition, and
// it grows linearly with the number of remotes.
declare module 'remote_quote/VehicleDetails' {
  export interface Vehicle {
    registration: string
    year: string
    mileage: string
  }
  export const VehicleDetails: React.ComponentType<{
    headingLevel?: 2 | 3 | 4
    // Stage 3: the shell's only channel to a remote for BFF-sourced data. A
    // remote never fetches from the BFF itself and never sees the access
    // token that did; it only ever receives the resolved shape.
    initialVehicle?: Vehicle
    onSubmit?: (vehicle: Vehicle) => void
  }>
}

declare module 'remote_account/PolicySummary' {
  export interface Policy {
    reference: string
    cover: string
    renewal: string
    excess: string
  }
  export const PolicySummary: React.ComponentType<{
    headingLevel?: 2 | 3 | 4
    initialPolicy?: Policy
    onExcessChange?: (excess: string) => void
  }>
}
