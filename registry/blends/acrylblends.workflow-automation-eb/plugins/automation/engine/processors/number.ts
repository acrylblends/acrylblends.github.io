// Ported from Qadam Flow (MIT) packages/server/engine/src/lib/variables/processors/number.ts @ 51bb340b; derived from Activepieces (MIT). See NOTICE.
import { isNil } from '@aiqadam/shared'
import type { ProcessorFn } from './types.ts'

export const numberProcessor: ProcessorFn = (_property, value) => {
    if (isNil(value)) {
        return value
    }
    if (value === '') {
        return undefined
    }
    return Number(value)
}