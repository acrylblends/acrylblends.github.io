import type { Params } from '../../router.ts';
export declare class Node<T> {
    #private;
    insert(method: string, path: string, handler: T): void;
    search(method: string, path: string): [[T, Params][]];
}
