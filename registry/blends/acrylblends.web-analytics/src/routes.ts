/**
 * The app's name and the one place its mount prefix is named. The reports themselves are plugins (plugins/overview, reports, tracking), each with its
 * own row in blend.yaml; nothing here serves a route.
 *
 * On its own server (production, `npm start`) the app mounts at the root and its URLs are `/overview`, `/acquisition`, `/pages`, `/events`,
 * `/conversions`, `/settings/tracking` and `/collect`; when the ACRYL frame hosts it they mount under this prefix.
 */
export const APP_NAME = 'web-analytics'

export const FRAME_MOUNT_PREFIX = '/app'
