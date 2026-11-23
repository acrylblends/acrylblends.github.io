// Ported from Qadam Flow (MIT) packages/server/engine/src/lib/variables/processors/date-time.ts @ 51bb340b; derived from Activepieces (MIT). See NOTICE.
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone.js'
import utc from 'dayjs/plugin/utc.js'
import type { ProcessorFn } from './types.ts'

export const dateTimeProcessor: ProcessorFn = (_property, value) => {
    dayjs.extend(utc)
    dayjs.extend(timezone)
    const dateTimeString = value
    try {
        if (!dateTimeString) throw Error('Undefined input')
        return dayjs.tz(dateTimeString, 'UTC').toISOString()
    }
    catch (error) {
        console.error(error)
        return undefined
    }
}