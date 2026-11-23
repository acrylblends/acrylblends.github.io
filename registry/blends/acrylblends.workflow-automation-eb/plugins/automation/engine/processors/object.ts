// Ported from Qadam Flow (MIT) packages/server/engine/src/lib/variables/processors/object.ts @ 51bb340b; derived from Activepieces (MIT). See NOTICE.
import { isNil } from '@aiqadam/shared'
import type { ProcessorFn } from './types.ts'

export const objectProcessor: ProcessorFn = (_property, value) => {
    if (isNil(value)) {
        return value
    }
    if (typeof value === 'string') {
        try {
            return JSON.parse(value)
        }
        catch (e) {
            return undefined
        }
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
        return value
    }
    return undefined
}