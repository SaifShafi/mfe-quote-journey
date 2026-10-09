// The host has no build-time knowledge of the remote, so TypeScript needs to be
// told the shape of the contract by hand. This file is the contract: if the
// remote changes its export and nobody updates this, the break only shows up at
// runtime in the composed app. That gap is the cost of runtime composition.
declare module 'remote_quote/VehicleDetails' {
  export interface Vehicle {
    registration: string
    year: string
    mileage: string
  }
  export const VehicleDetails: React.ComponentType<{
    onSubmit?: (vehicle: Vehicle) => void
  }>
}
