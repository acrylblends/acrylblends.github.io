import type { Acryl } from '../app.ts';
import type { UnionToIntersection } from '../utils/types.ts';
import type { Client, ClientRequestOptions } from './types.ts';
export declare const hc: <T extends Acryl<any, any, any>, Prefix extends string = string>(baseUrl: Prefix, options?: ClientRequestOptions) => UnionToIntersection<Client<T, Prefix>>;
