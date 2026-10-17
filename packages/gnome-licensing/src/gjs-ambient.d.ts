/**
 * Ambient declarations for the GJS runtime this package is compiled against.
 *
 * Only used to build the package: the emitted type declarations import from
 * `gi://` modules, which a consuming extension declares through the same
 * `@girs/*` packages (listed as peer dependencies).
 */

/// <reference types="@girs/gjs" />
/// <reference types="@girs/gjs/dom" />
/// <reference types="@girs/gio-2.0/ambient" />
/// <reference types="@girs/glib-2.0/ambient" />
/// <reference types="@girs/adw-1/ambient" />
/// <reference types="@girs/gtk-4.0/ambient" />

// libsoup 3 has no `@girs` package in use here; declare the few members the
// HTTP client needs. They stay internal: no exported type refers to them.
declare module 'gi://Soup?version=3.0' {
  export default Soup;
}

declare namespace Soup {
  class Session {
    timeout: number;
    send_and_read_async(
      message: Message,
      priority: number,
      cancellable: import('gi://Gio').default.Cancellable | null,
      callback: (session: Session, result: import('gi://Gio').default.AsyncResult) => void
    ): void;
    send_and_read_finish(
      result: import('gi://Gio').default.AsyncResult
    ): import('gi://GLib').default.Bytes;
  }

  class Message {
    static new(method: string, uri: string): Message | null;
    set_request_body_from_bytes(
      content_type: string,
      bytes: import('gi://GLib').default.Bytes
    ): void;
    get_status(): number;
  }
}
