/**
 * Preferences entry: the license UI for an extension's preferences window.
 *
 * Built on Adw and GTK 4, which only the preferences process can load, so it
 * must not be imported from code running in the GNOME Shell process.
 */

export type { LicenseGroupOptions } from './prefs/license-ui.js';
export { createLicenseGroup } from './prefs/license-ui.js';
