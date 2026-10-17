/**
 * NotificationService
 *
 * Sends user-visible notifications. The consuming extension implements this,
 * e.g. with the GNOME Shell notification system.
 */
export interface NotificationService {
  /**
   * Report a failure the user needs to act on.
   */
  notifyError(title: string, details?: string): void;

  /**
   * Report something the user should know about before it becomes a failure.
   */
  notifyWarning(title: string, details?: string): void;
}
