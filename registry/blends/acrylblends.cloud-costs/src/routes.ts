/**
 * The app's name and the one place its mount prefix is named. The pages themselves are plugins (plugins/overview, explorer, budgets), each with its
 * own row in blend.yaml; nothing here serves a route.
 *
 * On its own server (production, `npm start`) the app mounts at the root and its URLs are `/costs`, `/explorer`, `/imports`, `/budgets`, `/alerts`,
 * `/allocation-rules`; when the ACRYL frame hosts it they mount under this prefix. src/app.ts hands the prefix to the `finops-shell` row.
 */
export const APP_NAME = 'cloud-costs'

export const FRAME_MOUNT_PREFIX = '/app'
