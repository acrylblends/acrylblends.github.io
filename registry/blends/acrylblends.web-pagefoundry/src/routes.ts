/**
 * The app's name and the one place its mount prefix is named. The builder's regions are plugins (plugins/pages, blocks, canvas, design, publish), each
 * with its own row in blend.yaml; nothing here serves a route. On its own server the app mounts at the root; in the ACRYL frame under this prefix, and
 * every plugin mounts and links under `ctx.builderShell.prefix`.
 */
export const APP_NAME = 'pagefoundry'

export const FRAME_MOUNT_PREFIX = '/app'
