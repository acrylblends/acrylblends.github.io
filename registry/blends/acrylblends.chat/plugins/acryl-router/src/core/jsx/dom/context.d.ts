import type { Context } from '../context.ts';
export declare const createContextProviderFunction: <T>(values: T[]) => Function;
export declare const createContext: <T>(defaultValue: T) => Context<T>;
