import type { Context } from '../../context.ts';
import type { StreamingApi } from '../../utils/stream.ts';
export declare const streamText: (c: Context, cb: (stream: StreamingApi) => Promise<void>, onError?: (e: Error, stream: StreamingApi) => Promise<void>) => Response;
