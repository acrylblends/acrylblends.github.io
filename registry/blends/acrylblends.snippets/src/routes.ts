/**
 * The app's name and the one place its mount prefix is named. The pages themselves are plugins (plugins/library, editor, collections, language-settings),
 * each with its own row in blend.yaml; nothing here serves a route.
 *
 * On its own server (production, `npm start`) the app mounts at the root and its URLs are `/snippets`, `/snippets/:id`, `/new`, `/collections`; when
 * the ACRYL frame hosts it (`npm run dev`) they mount under this prefix, and the frame opens its tile at `/app/`. src/app.ts hands the prefix to the
 * `snips-shell` row, and every page plugin mounts and links under `ctx.shell.prefix`.
 */
export const APP_NAME = 'snippets'

export const FRAME_MOUNT_PREFIX = '/app'
