import type { Result, Router } from '../../router.ts';
export declare class TrieRouter<T> implements Router<T> {
    #private;
    name: string;
    add(method: string, path: string, handler: T): void;
    match(method: string, path: string): Result<T>;
}
