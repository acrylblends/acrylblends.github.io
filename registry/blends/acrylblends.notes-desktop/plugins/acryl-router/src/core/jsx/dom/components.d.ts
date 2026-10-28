import type { Child, FC, PropsWithChildren } from '../index.ts';
import type { ErrorHandler, FallbackRender } from '../components.ts';
export declare const ErrorBoundary: FC<PropsWithChildren<{
    fallback?: Child;
    fallbackRender?: FallbackRender;
    onError?: ErrorHandler;
}>>;
export declare const Suspense: FC<PropsWithChildren<{
    fallback: any;
}>>;
