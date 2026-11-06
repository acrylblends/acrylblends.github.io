/**
 * The app's name and the one place its mount prefix is named. The pages are plugins (plugins/terminal, transfers, audit and the connections and
 * session-rail columns), each with its own row in blend.yaml; nothing here serves a route. On its own server the app mounts at the root; in the
 * ACRYL frame under this prefix, and every plugin mounts and links under `ctx.relayShell.prefix`.
 */
export const APP_NAME = 'relay'

export const FRAME_MOUNT_PREFIX = '/app'
