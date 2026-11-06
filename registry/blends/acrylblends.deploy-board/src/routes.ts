/**
 * The app's name and the one place its mount prefix is named. The pages themselves are plugins (plugins/board, incidents, services), each with its
 * own row in blend.yaml; nothing here serves a route.
 *
 * On its own server (production, `npm start`) the app mounts at the root and its URLs are `/deployments`, `/deployments/new`, `/incidents`,
 * `/services`, `/environments`, `/events`; when the ACRYL frame hosts it they mount under this prefix. src/app.ts hands the prefix to the
 * `release-shell` row.
 */
export const APP_NAME = 'deploy-board'

export const FRAME_MOUNT_PREFIX = '/app'
