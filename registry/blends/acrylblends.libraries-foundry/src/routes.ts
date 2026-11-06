/**
 * The app's name and the one place its mount prefix is named. The three columns are plugins (plugins/filters, catalogue, detail) and so is the stack
 * (plugins/stack); each has its own row in blend.yaml and nothing here serves a route. On its own server the app mounts at the root; in the ACRYL
 * frame under this prefix, and every plugin mounts and links under `ctx.foundryShell.prefix`.
 */
export const APP_NAME = 'foundry'

export const FRAME_MOUNT_PREFIX = '/app'
