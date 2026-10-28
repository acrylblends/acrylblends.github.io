/**
 * @module
 * Dev Helper for Acryl.
 */
import type { Acryl } from '../../app.ts';
import type { Env } from '../../types.ts';
interface ShowRoutesOptions {
    verbose?: boolean;
    colorize?: boolean;
}
interface RouteData {
    path: string;
    method: string;
    name: string;
    isMiddleware: boolean;
}
export declare const inspectRoutes: <E extends Env>(acryl: Acryl<E>) => RouteData[];
export declare const showRoutes: <E extends Env>(acryl: Acryl<E>, opts?: ShowRoutesOptions) => void;
export declare const getRouterName: <E extends Env>(app: Acryl<E>) => string;
export {};
