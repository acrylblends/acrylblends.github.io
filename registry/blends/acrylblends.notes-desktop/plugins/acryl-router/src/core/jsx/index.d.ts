/**
 * @module
 * JSX for Acryl.
 */
import { Fragment, cloneElement, isValidElement, jsx, memo, reactAPICompatVersion } from './base.ts';
import type { DOMAttributes } from './base.ts';
import { Children } from './children.ts';
import { ErrorBoundary } from './components.ts';
import { createContext, useContext } from './context.ts';
import { useActionState, useOptimistic } from './dom/hooks/index.ts';
import { createRef, forwardRef, startTransition, startViewTransition, use, useCallback, useDebugValue, useDeferredValue, useEffect, useId, useImperativeHandle, useInsertionEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, useTransition, useViewTransition } from './hooks/index.ts';
import { Suspense } from './streaming.ts';
export { reactAPICompatVersion as version, jsx, memo, Fragment, Fragment as StrictMode, isValidElement, jsx as createElement, cloneElement, ErrorBoundary, createContext, useContext, useState, useEffect, useRef, useCallback, useReducer, useId, useDebugValue, use, startTransition, useTransition, useDeferredValue, startViewTransition, useViewTransition, useMemo, useLayoutEffect, useInsertionEffect, createRef, forwardRef, useImperativeHandle, useSyncExternalStore, useActionState, useOptimistic, Suspense, Children, };
export type { DOMAttributes };
declare const _default: {
    version: string;
    memo: <T>(component: import("./base.ts").FC<T>, propsAreEqual?: (prevProps: Readonly<T>, nextProps: Readonly<T>) => boolean) => import("./base.ts").FC<T>;
    Fragment: ({ children, }: {
        key?: string;
        children?: import("./base.ts").Child | import("../utils/html.ts").HtmlEscapedString;
    }) => import("../utils/html.ts").HtmlEscapedString;
    StrictMode: ({ children, }: {
        key?: string;
        children?: import("./base.ts").Child | import("../utils/html.ts").HtmlEscapedString;
    }) => import("../utils/html.ts").HtmlEscapedString;
    isValidElement: (element: unknown) => element is import("./base.ts").JSXNode;
    createElement: (tag: string | Function, props: import("./base.ts").Props | null, ...children: import("./base.ts").Child[]) => import("./base.ts").JSXNode;
    cloneElement: <T extends import("./base.ts").JSXNode | import("./base.ts").JSX.Element>(element: T, props: Partial<import("./base.ts").Props>, ...children: import("./base.ts").Child[]) => T;
    ErrorBoundary: import("./base.ts").FC<import("./types.ts").PropsWithChildren<{
        fallback?: import("./base.ts").Child;
        fallbackRender?: import("./components.ts").FallbackRender;
        onError?: import("./components.ts").ErrorHandler;
    }>>;
    createContext: <T>(defaultValue: T) => import("./context.ts").Context<T>;
    useContext: <T>(context: import("./context.ts").Context<T>) => T;
    useState: {
        <T>(initialState: T | (() => T)): [T, (newState: T | ((currentState: T) => T)) => void];
        <T = undefined>(): [T | undefined, (newState: T | ((currentState: T | undefined) => T | undefined) | undefined) => void];
    };
    useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => void;
    useRef: typeof useRef;
    useCallback: <T extends Function>(callback: T, deps: readonly unknown[]) => T;
    useReducer: <T, A>(reducer: (state: T, action: A) => T, initialArg: T, init?: (initialState: T) => T) => [T, (action: A) => void];
    useId: () => string;
    useDebugValue: (_value: unknown, _formatter?: (value: unknown) => string) => void;
    use: <T>(promise: Promise<T>) => T;
    startTransition: (callback: () => void) => void;
    useTransition: () => [boolean, (callback: () => void | Promise<void>) => void];
    useDeferredValue: <T>(value: T, initialValue?: T) => T;
    startViewTransition: (callback: () => void) => void;
    useViewTransition: () => [boolean, (callback: () => void) => void];
    useMemo: <T>(factory: () => T, deps: readonly unknown[]) => T;
    useLayoutEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => void;
    useInsertionEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => void;
    createRef: <T>() => import("./types.ts").RefObject<T | null>;
    forwardRef: <T, P = {}>(Component: (props: P, ref?: import("./types.ts").RefObject<T | null>) => import("./base.ts").JSX.Element) => ((props: P & {
        ref?: import("./types.ts").RefObject<T | null>;
    }) => import("./base.ts").JSX.Element);
    useImperativeHandle: <T>(ref: import("./types.ts").RefObject<T | null>, createHandle: () => T, deps: readonly unknown[]) => void;
    useSyncExternalStore: <T>(subscribe: (callback: () => void) => () => void, getSnapshot: () => T, getServerSnapshot?: () => T) => T;
    useActionState: <T>(fn: Function, initialState: T, permalink?: string) => [T, Function];
    useOptimistic: <T, N>(state: T, updateState: (currentState: T, action: N) => T) => [T, (action: N) => void];
    Suspense: import("./base.ts").FC<import("./types.ts").PropsWithChildren<{
        fallback: any;
    }>>;
    Children: {
        map: (children: import("./base.ts").Child[], fn: (child: import("./base.ts").Child, index: number) => import("./base.ts").Child) => import("./base.ts").Child[];
        forEach: (children: import("./base.ts").Child[], fn: (child: import("./base.ts").Child, index: number) => void) => void;
        count: (children: import("./base.ts").Child[]) => number;
        only: (_children: import("./base.ts").Child[]) => import("./base.ts").Child;
        toArray: (children: import("./base.ts").Child) => import("./base.ts").Child[];
    };
};
export default _default;
export type * from './types.ts';
export type { JSX } from './intrinsic-elements.ts';
