// Ported from Qadam Flow (MIT, https://github.com/aiqadam/qadam-flow @ 51bb340b), packages/server/engine/src/lib/handler/router-executor.ts lines 123-309,
// itself derived from Activepieces (MIT). The branch conditions of a Router step, unchanged except for the imports. See NOTICE.
import { BranchOperator, type BranchCondition, EngineGenericError, isNil } from '@aiqadam/shared'
import dayjs from 'dayjs'

export function evaluateConditions(conditionGroups: BranchCondition[][]): boolean {
    let orOperator = false
    for (const conditionGroup of conditionGroups) {
        // A group with no conditions used to leave `andGroup` at its `true` seed and match
        // unconditionally, so a CONDITION branch carrying `[[]]` — what the MCP router skeleton
        // wrote — won ahead of every real branch added after it, silently making them dead code
        // (#429). Nothing is asserted by an empty group, so it contributes nothing to the OR.
        if (conditionGroup.length === 0) {
            continue
        }
        let andGroup = true
        for (const condition of conditionGroup) {
            const castedCondition = condition

            if (isNil(castedCondition.operator)) {
                throw new EngineGenericError('OperatorNotSetError', 'The operator is required but found to be undefined')
            }

            switch (castedCondition.operator) {
                case BranchOperator.TEXT_CONTAINS: {
                    const firstValueContains = toLowercaseIfCaseInsensitive(castedCondition.firstValue, castedCondition.caseSensitive).includes(
                        toLowercaseIfCaseInsensitive(castedCondition.secondValue, castedCondition.caseSensitive),
                    )
                    andGroup = andGroup && firstValueContains
                    break
                }
                case BranchOperator.TEXT_DOES_NOT_CONTAIN: {
                    const firstValueDoesNotContain = !toLowercaseIfCaseInsensitive(castedCondition.firstValue, castedCondition.caseSensitive).includes(
                        toLowercaseIfCaseInsensitive(castedCondition.secondValue, castedCondition.caseSensitive),
                    )
                    andGroup = andGroup && firstValueDoesNotContain
                    break
                }
                case BranchOperator.TEXT_EXACTLY_MATCHES: {
                    const firstValueExactlyMatches = toLowercaseIfCaseInsensitive(castedCondition.firstValue, castedCondition.caseSensitive) ===
                        toLowercaseIfCaseInsensitive(castedCondition.secondValue, castedCondition.caseSensitive)
                    andGroup = andGroup && firstValueExactlyMatches
                    break
                }
                case BranchOperator.TEXT_DOES_NOT_EXACTLY_MATCH: {
                    const firstValueDoesNotExactlyMatch = toLowercaseIfCaseInsensitive(castedCondition.firstValue, castedCondition.caseSensitive) !==
                        toLowercaseIfCaseInsensitive(castedCondition.secondValue, castedCondition.caseSensitive)
                    andGroup = andGroup && firstValueDoesNotExactlyMatch
                    break
                }
                case BranchOperator.TEXT_STARTS_WITH: {
                    const firstValueStartsWith = toLowercaseIfCaseInsensitive(castedCondition.firstValue, castedCondition.caseSensitive).startsWith(
                        toLowercaseIfCaseInsensitive(castedCondition.secondValue, castedCondition.caseSensitive),
                    )
                    andGroup = andGroup && firstValueStartsWith
                    break
                }
                case BranchOperator.TEXT_ENDS_WITH: {
                    const firstValueEndsWith = toLowercaseIfCaseInsensitive(castedCondition.firstValue, castedCondition.caseSensitive).endsWith(
                        toLowercaseIfCaseInsensitive(castedCondition.secondValue, castedCondition.caseSensitive),
                    )
                    andGroup = andGroup && firstValueEndsWith
                    break
                }
                case BranchOperator.TEXT_DOES_NOT_START_WITH: {
                    const firstValueDoesNotStartWith = !toLowercaseIfCaseInsensitive(castedCondition.firstValue, castedCondition.caseSensitive).startsWith(
                        toLowercaseIfCaseInsensitive(castedCondition.secondValue, castedCondition.caseSensitive),
                    )
                    andGroup = andGroup && firstValueDoesNotStartWith
                    break
                }
                case BranchOperator.TEXT_DOES_NOT_END_WITH: {
                    const firstValueDoesNotEndWith = !toLowercaseIfCaseInsensitive(castedCondition.firstValue, castedCondition.caseSensitive).endsWith(
                        toLowercaseIfCaseInsensitive(castedCondition.secondValue, castedCondition.caseSensitive),
                    )
                    andGroup = andGroup && firstValueDoesNotEndWith
                    break
                }
                case BranchOperator.LIST_CONTAINS: {
                    const list = parseAndCoerceListAsArray(castedCondition.firstValue)
                    andGroup = andGroup && list.some((item) =>
                        toLowercaseIfCaseInsensitive(item, castedCondition.caseSensitive) === toLowercaseIfCaseInsensitive(castedCondition.secondValue, castedCondition.caseSensitive),
                    )
                    break
                }
                case BranchOperator.LIST_DOES_NOT_CONTAIN: {
                    const list = parseAndCoerceListAsArray(castedCondition.firstValue)
                    andGroup = andGroup && !list.some((item) =>
                        toLowercaseIfCaseInsensitive(item, castedCondition.caseSensitive) === toLowercaseIfCaseInsensitive(castedCondition.secondValue, castedCondition.caseSensitive),
                    )
                    break
                }
                case BranchOperator.NUMBER_IS_GREATER_THAN: {
                    const firstValue = parseStringToNumber(castedCondition.firstValue)
                    const secondValue = parseStringToNumber(castedCondition.secondValue)
                    andGroup = andGroup && firstValue > secondValue
                    break
                }
                case BranchOperator.NUMBER_IS_LESS_THAN: {
                    const firstValue = parseStringToNumber(castedCondition.firstValue)
                    const secondValue = parseStringToNumber(castedCondition.secondValue)
                    andGroup = andGroup && firstValue < secondValue
                    break
                }
                case BranchOperator.NUMBER_IS_EQUAL_TO: {
                    const firstValue = parseStringToNumber(castedCondition.firstValue)
                    const secondValue = parseStringToNumber(castedCondition.secondValue)
                    andGroup = andGroup && firstValue == secondValue
                    break
                }
                case BranchOperator.BOOLEAN_IS_TRUE:
                    andGroup = andGroup && !!castedCondition.firstValue
                    break
                case BranchOperator.BOOLEAN_IS_FALSE:
                    andGroup = andGroup && !castedCondition.firstValue
                    break
                case BranchOperator.DATE_IS_AFTER:
                    andGroup = andGroup && isValidDate(castedCondition.firstValue) && isValidDate(castedCondition.secondValue) && dayjs(castedCondition.firstValue).isAfter(dayjs(castedCondition.secondValue))
                    break
                case BranchOperator.DATE_IS_EQUAL:
                    andGroup = andGroup && isValidDate(castedCondition.firstValue) && isValidDate(castedCondition.secondValue) && dayjs(castedCondition.firstValue).isSame(dayjs(castedCondition.secondValue))
                    break
                case BranchOperator.DATE_IS_BEFORE:
                    andGroup = andGroup && isValidDate(castedCondition.firstValue) && isValidDate(castedCondition.secondValue) && dayjs(castedCondition.firstValue).isBefore(dayjs(castedCondition.secondValue))
                    break
                case BranchOperator.LIST_IS_EMPTY: {
                    const list = parseListAsArray(castedCondition.firstValue)
                    andGroup = andGroup && Array.isArray(list) && list?.length === 0
                    break
                }
                case BranchOperator.LIST_IS_NOT_EMPTY: {
                    const list = parseListAsArray(castedCondition.firstValue)
                    andGroup = andGroup && Array.isArray(list) && list?.length !== 0
                    break
                }
                case BranchOperator.EXISTS:
                    andGroup = andGroup && castedCondition.firstValue !== undefined && castedCondition.firstValue !== null && castedCondition.firstValue !== ''
                    break
                case BranchOperator.DOES_NOT_EXIST:
                    andGroup = andGroup && (castedCondition.firstValue === undefined || castedCondition.firstValue === null || castedCondition.firstValue === '')
                    break
            }
        }
        orOperator = orOperator || andGroup
    }
    return Boolean(orOperator)
}

function toLowercaseIfCaseInsensitive(text: unknown, caseSensitive: boolean | undefined): string {
    if (typeof text === 'string') {
        return caseSensitive ? text : text.toLowerCase()
    }
    const textAsString = JSON.stringify(text)
    return caseSensitive ? textAsString : textAsString.toLowerCase()
}

function parseStringToNumber(str: string): number | string {
    const num = Number(str)
    return isNaN(num) ? str : num
}

function parseListAsArray(input: unknown): unknown[] | undefined {
    if (typeof input === 'string') {
        try {
            const parsed = JSON.parse(input)
            return Array.isArray(parsed) ? parsed : undefined
        }
        catch (e) {
            return undefined
        }
    }
    return Array.isArray(input) ? input : undefined
}

function parseAndCoerceListAsArray(input: unknown): unknown[] {
    if (typeof input === 'string') {
        try {
            const parsed = JSON.parse(input)
            return Array.isArray(parsed) ? parsed : [parsed]
        }
        catch (e) {
            return [input]
        }
    }
    return Array.isArray(input) ? input : [input]
}

function isValidDate(date: unknown): boolean {
    if (typeof date === 'string' || typeof date === 'number' || date instanceof Date) {
        return dayjs(date).isValid()
    }
    return false
}
