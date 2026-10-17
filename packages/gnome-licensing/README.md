# @haco-studio/gnome-licensing

The client side of a license gate for GNOME Shell extensions: a trial counted by days of use, license activation and validation against a license API, and an offline grace period.

This package is built for the author's own extensions. It is published so those extensions can share it, but it is not supported for any other use, and its API may change in any `0.x` release.

## Behavior

- **Trial by day of use.** The trial lasts 30 days of use. A day counts once, the first time the extension is used on that calendar day.
- **No downgrade on no response.** Only an answer from the license server can expire or invalidate a license. A timeout, a transport failure, a 5xx, a 404, a 410 or a 4xx without a known reason code counts as no response and keeps the stored status.
- **Offline limit.** A valid license keeps working offline for 7 days, counted from the last time the device was online (whether or not the license server answered).
- **Keyless probe after the trial.** Once the trial has ended, the client asks the license server whether it is still there, with an empty license key. An ended trial stays locked while the server answers and opens once it no longer does, so retiring the server never strands anyone.

## Entry points

A GNOME Shell extension runs in two processes: the Shell process, which cannot load GTK 4, and the preferences process, which cannot load Shell modules. The package is split accordingly.

| Entry | Load from | Contains |
|---|---|---|
| `@haco-studio/gnome-licensing` | `extension.js` (and `prefs.js` if needed) | Domain, operations and their ports, the HTTP client (libsoup 3), the GLib/Gio adapters, `LicenseStateHandler` |
| `@haco-studio/gnome-licensing/prefs` | `prefs.js` only | `createLicenseGroup`, the license key entry for the preferences window (Adw/GTK 4) |

The modules are ES modules that import `gi://` libraries, so the extension is expected to bundle them (for example with esbuild, leaving `gi://*` and `resource://*` imports external).

The type declarations import from `gi://Gio` and `gi://Adw`. Declare those modules in the extension through the `@girs/*` packages listed as peer dependencies.

## Parameters

Everything specific to an extension is passed in by that extension:

| Parameter | Where |
|---|---|
| License API base URL | `new HttpLicenseApiClient(baseUrl)`, and `apiBaseUrl` of `createLicenseGroup` |
| `Gio.Settings` holding the license state | `new GSettingsLicenseRepository(settings)`, and `settings` of `createLicenseGroup` |
| Product name shown to the user | `new TrialWarningOperations(repository, notificationService, productName)`, `describeDisabledReason(reason, productName)` |
| Purchase page (optional) | `purchaseUrl` of `createLicenseGroup`, and `{ purchaseAvailable }` of `getLicenseStatusDisplay`. When absent, nothing offers to purchase a license |

The extension also implements `NotificationService`, which shows the trial pre-expiry warning (in the Shell, for example through `Main.notify`).

## GSettings keys

The repository reads and writes these keys of the `Gio.Settings` object it is given. Declare them in the extension's own GSettings schema with these types and defaults.

| Key | Type | Default | Meaning |
|---|---|---|---|
| `license-status` | `s` | `'trial'` | `trial`, `trial-expired`, `valid`, `expired` or `invalid` |
| `license-key` | `s` | `''` | The activated license key |
| `license-activation-id` | `s` | `''` | Activation id returned by the license API |
| `license-valid-until` | `x` | `0` | End of the subscription period as last confirmed (Unix seconds) |
| `license-last-validated` | `x` | `0` | Last successful validation (Unix seconds) |
| `last-online-at` | `x` | `0` | Last time the device was online (Unix seconds); `0` means not recorded |
| `trial-days-used` | `i` | `0` | Days of use counted during the trial (0 to 30) |
| `trial-last-used-date` | `s` | `''` | Last day counted, as `YYYY-MM-DD` |
| `trial-warning-last-threshold` | `i` | `0` | Remaining-day threshold (3 or 1) last warned about; `0` means none |
| `trial-probe-result` | `s` | `'none'` | `none`, `answered` or `no-response` |

For example:

```xml
<key name="license-status" type="s">
  <default>'trial'</default>
</key>
<key name="license-valid-until" type="x">
  <default>0</default>
</key>
```

## Wiring

In the Shell process:

```ts
import {
  describeDisabledReason,
  GioNetworkStateProvider,
  GLibDateProvider,
  GSettingsLicenseRepository,
  HttpLicenseApiClient,
  LicenseOperations,
  LicenseStateHandler,
  SystemDeviceInfoProvider,
  TrialWarningOperations,
} from '@haco-studio/gnome-licensing';

const repository = new GSettingsLicenseRepository(this.getSettings());
const licenseOperations = new LicenseOperations(
  repository,
  new HttpLicenseApiClient('https://license.example.com'),
  new GLibDateProvider(),
  new GioNetworkStateProvider(),
  new SystemDeviceInfoProvider()
);
const handler = new LicenseStateHandler(
  licenseOperations,
  new TrialWarningOperations(repository, notificationService, 'Example')
);

handler.initialize((reason) => {
  // Lock the extension and explain why.
  const { headline, instruction } = describeDisabledReason(reason, 'Example');
});

// Whenever the user uses the extension, before checking whether it is locked:
handler.recordUse();
const reason = handler.getDisabledReason();

// On disable:
handler.dispose();
```

In the preferences process:

```ts
import { createLicenseGroup } from '@haco-studio/gnome-licensing/prefs';

page.add(
  createLicenseGroup(window, {
    settings: this.getSettings(),
    apiBaseUrl: 'https://license.example.com',
    purchaseUrl: 'https://example.com/purchase', // optional
  })
);
```

The preferences window writes license changes straight to GSettings; `LicenseStateHandler` follows them in the Shell process, so activating a license there unlocks the extension without reloading it.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
