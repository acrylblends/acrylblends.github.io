import type { Router } from '../../router.ts';
import type { MatcherMap } from './matcher.ts';
import { match } from './matcher.ts';
export declare class RegExpRouter<T> implements Router<T> {
    #private;
    name: string;
    constructor();
    add(method: string, path: string, handler: T): void;
    match: typeof match<Router<T>, T>;
    protected buildAllMatchers(): MatcherMap<T>;
}
