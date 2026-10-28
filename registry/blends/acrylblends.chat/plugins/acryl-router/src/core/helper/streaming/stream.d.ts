import type { Context } from '../../context.ts';
import { StreamingApi } from '../../utils/stream.ts';
export declare const stream: (c: Context, cb: (stream: StreamingApi) => Promise<void>, onError?: (e: Error, stream: StreamingApi) => Promise<void>) => Response;
