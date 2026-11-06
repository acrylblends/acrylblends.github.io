/**
 * The app's name and the one place its mount prefix is named. The device's screens are plugins (plugins/home, capture, activity, profile) and so is the
 * companion panel (plugins/widgets); each has its own row in blend.yaml and nothing here serves a route. On its own server the app mounts at the root;
 * in the ACRYL frame under this prefix, and every plugin mounts and links under `ctx.phoneShell.prefix`.
 */
export const APP_NAME = 'mobiary'

export const FRAME_MOUNT_PREFIX = '/app'
