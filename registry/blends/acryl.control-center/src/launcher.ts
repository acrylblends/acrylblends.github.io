/**
 * The launcher's Host half is the @acryldev/launcher-desktop package (spec 052 T055). The package lists and makes apps in ACRYL's root (`~/.acryl`), while a
 * Blends frame's `appInstance.home` is this app's own data folder, so this row passes the root the AppInstance family names (`acrylRoot`), never read from
 * the environment here. The `acrylTools` port, the launcher's tools in the chat, comes from the frame (@acryldev/blends-frame 0.2.18).
 */
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { acrylRoot, personHome } from '@acryldev/instance/storage'
import * as launcher from '@acryldev/launcher-desktop'

export const name = 'acryl-launcher-desktop'
export const inject = ['appInstance', 'router', 'routerHttp']

export function apply(ctx: Context): void {
  const root = acrylRoot(process.platform, process.env, personHome(process.env, process.platform))
  // The copy this app runs from (src/ is one folder below it): the screen, Settings > Updates and the menu then offer its Blend's newer releases.
  const self = { folder: dirname(dirname(fileURLToPath(import.meta.url))), name: 'ACRYL Control Center' }
  ctx.plugin(launcher, { root, self })
}
