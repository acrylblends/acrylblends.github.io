/**
 * The music plugin's persistence gateway: one JSON file in the project (`<app home>/.acryl/music.json`) holding the pattern on the sequencer and the
 * patterns saved by name. Writes go through a temp file and a rename, so a crash never leaves half a file. A file that is not music data is refused.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { checkState, emptyState } from './domain.js'

export function fileStore(file) {
  return {
    file,
    load() {
      if (!existsSync(file)) return emptyState()
      return checkState(JSON.parse(readFileSync(file, 'utf8')))
    },
    save(state) {
      mkdirSync(dirname(file), { recursive: true })
      const temporary = `${file}.${process.pid}.tmp`
      writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`)
      renameSync(temporary, file)
    },
  }
}
