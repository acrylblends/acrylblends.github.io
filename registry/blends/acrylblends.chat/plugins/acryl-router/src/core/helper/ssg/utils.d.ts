import type { Acryl } from '../../app.ts';
import type { Env } from '../../types.ts';
/**
 * Get dirname
 * @param path File Path
 * @returns Parent dir path
 */
export declare const dirname: (path: string) => string;
export declare const joinPaths: (...paths: string[]) => string;
interface FilterStaticGenerateRouteData {
    path: string;
}
export declare const filterStaticGenerateRoutes: <E extends Env>(acryl: Acryl<E>) => FilterStaticGenerateRouteData[];
export declare const isDynamicRoute: (path: string) => boolean;
export declare const ensureWithinOutDir: (outDir: string, filePath: string) => void;
export {};
