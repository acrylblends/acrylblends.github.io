/**
 * The app's name and the one place its mount prefix is named. The three columns and the pipeline are plugins (plugins/routes, upstreams, pipeline,
 * policy), each with its own row in blend.yaml; nothing here serves a route. On its own server the app mounts at the root; in the ACRYL frame under
 * this prefix, and every plugin mounts and links under `ctx.gateShell.prefix`.
 */
export const APP_NAME = 'gatehouse'

export const FRAME_MOUNT_PREFIX = '/app'
