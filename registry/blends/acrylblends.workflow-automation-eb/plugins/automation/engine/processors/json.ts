// Ported from Qadam Flow (MIT) packages/server/engine/src/lib/variables/processors/json.ts @ 51bb340b; derived from Activepieces (MIT). See NOTICE.
import { isNil } from '@aiqadam/shared'
import type { ProcessorFn } from './types.ts'

export const jsonProcessor: ProcessorFn = (_property, value) => {
    if (isNil(value)) {
        return value
    }
    try {
        if (typeof value === 'object') {
            return value
        }
        return JSON.parse(value)
    }
    catch (error) {
        console.error(error)
        return undefined
    }
}