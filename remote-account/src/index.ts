// Async boundary. Federation needs a tick to negotiate shared modules before
// any shared dependency is imported, so the real entry is loaded dynamically.
// Importing bootstrap statically is the "Shared module is not available for
// eager consumption" error.
import('./bootstrap')
