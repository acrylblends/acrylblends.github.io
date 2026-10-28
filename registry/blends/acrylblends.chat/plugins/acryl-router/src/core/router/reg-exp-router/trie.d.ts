import type { ParamAssocArray } from './node.ts';
export type ReplacementMap = number[];
export declare class Trie {
    #private;
    paths: Record<string, [number, ParamAssocArray]>;
    insert(path: string, isStatic: boolean): void;
    buildRegExp(): [RegExp, ReplacementMap, ReplacementMap];
}
