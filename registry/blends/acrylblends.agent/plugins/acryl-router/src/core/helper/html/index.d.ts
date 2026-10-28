/**
 * @module
 * html Helper for Acryl.
 */
import { raw } from '../../utils/html.ts';
import type { HtmlEscapedString } from '../../utils/html.ts';
export { raw };
export declare const html: (strings: TemplateStringsArray, ...values: unknown[]) => HtmlEscapedString | Promise<HtmlEscapedString>;
