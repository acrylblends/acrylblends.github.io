/**
 * The app's name and the one place its mount prefix is named. The pages themselves are plugins (plugins/setup, field, traces, archive, and the
 * library and inspector columns), each with its own row in blend.yaml; nothing here serves a route.
 *
 * On its own server (production, `npm start`) the app mounts at the root and its URLs are `/`, `/field`, `/traces`, `/archive`; when the ACRYL
 * frame hosts it (`npm run dev`) they mount under this prefix, and the frame opens its tile at `/app/`. src/app.ts hands the prefix to the
 * `lab-shell` row, and every page plugin mounts and links under `ctx.labShell.prefix`.
 */
export const APP_NAME = 'morrow-lab'

export const FRAME_MOUNT_PREFIX = '/app'
