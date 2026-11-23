// Ported from Qadam Flow (MIT) packages/server/engine/src/lib/variables/processors/index.ts @ 51bb340b; derived from Activepieces (MIT). See NOTICE.
import { PropertyType } from '@aiqadam/qadams-framework'
import { dateTimeProcessor } from './date-time.ts'
import { fileProcessor } from './file.ts'
import { jsonProcessor } from './json.ts'
import { numberProcessor } from './number.ts'
import { objectProcessor } from './object.ts'
import { textProcessor } from './text.ts'
import type { ProcessorFn } from './types.ts'

export const processors: Partial<Record<PropertyType, ProcessorFn>> = {
    JSON: jsonProcessor,
    OBJECT: objectProcessor,
    NUMBER: numberProcessor,
    LONG_TEXT: textProcessor,
    SHORT_TEXT: textProcessor,
    SECRET_TEXT: textProcessor,
    DATE_TIME: dateTimeProcessor,
    FILE: fileProcessor,
}