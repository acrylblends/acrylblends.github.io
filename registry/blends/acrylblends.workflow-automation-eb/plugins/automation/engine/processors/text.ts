// Ported from Qadam Flow (MIT) packages/server/engine/src/lib/variables/processors/text.ts @ 51bb340b; derived from Activepieces (MIT). See NOTICE.
import { isNil } from '@aiqadam/shared'
import type { ProcessorFn } from './types.ts'

export const textProcessor: ProcessorFn = (property, value) => {
    if (isNil(value)) {
        return value
    }
    if (typeof value === 'object') {
        return JSON.stringify(value)
    }

    const result = value.toString()
    if (result.length === 0 && !property.required) {
        return undefined
    }
    return result
}