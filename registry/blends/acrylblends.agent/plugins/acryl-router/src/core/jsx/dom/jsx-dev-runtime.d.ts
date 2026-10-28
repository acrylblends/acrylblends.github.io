/**
 * @module
 * This module provides the `acryl-router/jsx/dom` dev runtime.
 */
import type { JSXNode, Props } from '../base.ts';
export type { JSX } from '../base.ts';
export declare const jsxDEV: (tag: string | Function, props: Props, key?: string) => JSXNode;
export declare const Fragment: (props: Record<string, unknown>) => JSXNode;
