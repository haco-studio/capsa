/**
 * Main entry: the license gate for code running in the GNOME Shell process.
 *
 * Holds the domain, the operations and their ports, the HTTP client of the
 * license API, the GLib/Gio adapters and the state handler. Nothing here loads
 * GTK, so it is safe to import from an extension's `extension.js`. The
 * preferences UI lives in the `./prefs` entry.
 */

export { LicenseStateHandler } from './composition/license-state-handler.js';
export * from './domain/index.js';
export { HttpLicenseApiClient } from './infra/api/index.js';
export {
  GioNetworkStateProvider,
  GLibDateProvider,
  GSettingsLicenseRepository,
  SystemDeviceInfoProvider,
} from './infra/glib/index.js';
export * from './operations/index.js';
