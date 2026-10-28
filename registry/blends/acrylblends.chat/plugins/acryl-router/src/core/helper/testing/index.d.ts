/**
 * @module
 * Testing Helper for Acryl.
 */
import type { ClientRequestOptions } from '../../client/index.ts';
import type { Client } from '../../client/types.ts';
import type { ExecutionContext } from '../../context.ts';
import type { Acryl } from '../../app.ts';
import type { Schema } from '../../types.ts';
import type { UnionToIntersection } from '../../utils/types.ts';
type ExtractEnv<T> = T extends Acryl<infer E, Schema, string> ? E : never;
export declare const testClient: <T extends Acryl<any, Schema, string>>(app: T, Env?: ExtractEnv<T>["Bindings"] | {}, executionCtx?: ExecutionContext, options?: Omit<ClientRequestOptions, "fetch">) => UnionToIntersection<Client<T, "http://localhost">>;
export {};
