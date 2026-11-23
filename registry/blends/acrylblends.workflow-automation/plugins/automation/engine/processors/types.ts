// Ported from Qadam Flow (MIT) packages/server/engine/src/lib/variables/processors/types.ts @ 51bb340b; derived from Activepieces (MIT). See NOTICE.

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { QadamProperty } from '@aiqadam/qadams-framework'

export type ProcessorFn<INPUT = any, OUTPUT = any> = (
    property: QadamProperty,
    value: INPUT,
) => OUTPUT
