/**
 * The app's name and the one place its mount prefix is named. The pages themselves are plugins (plugins/my-day, inbox, tasks, notes, calendar), each
 * with its own row in blend.yaml; nothing here serves a route.
 *
 * On its own server (production, `npm start`) the app mounts at the root and its URLs are `/`, `/inbox`, `/tasks`, `/notes/:id`, `/calendar`; when the
 * ACRYL frame hosts it (`npm run dev`) they mount under this prefix, and the frame opens its tile at `/app/`. src/app.ts hands the prefix to the
 * `audit-shell` row, and every page plugin mounts and links under `ctx.auditShell.prefix`.
 */
export const APP_NAME = 'clearpath-audit'

export const FRAME_MOUNT_PREFIX = '/app'
