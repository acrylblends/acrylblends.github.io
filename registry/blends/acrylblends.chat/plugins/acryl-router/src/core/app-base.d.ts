/**
 * @module
 * This module is the base module for the Acryl object.
 */
import { Context } from './context.ts';
import type { ExecutionContext } from './context.ts';
import type { Router } from './router.ts';
import type { Env, ErrorHandler, H, HandlerInterface, MergePath, MergeSchemaPath, MiddlewareHandlerInterface, NotFoundHandler, OnHandlerInterface, RouterRoute, Schema } from './types.ts';
type GetPath<E extends Env> = (request: Request, options?: {
    env?: E['Bindings'];
}) => string;
export type AcrylOptions<E extends Env> = {
    /**
     * `router` option specifies which router to use.
     *
     *
     * @example
     * ```ts
     * const app = new Acryl({ router: new RegExpRouter() })
     * ```
     */
    router?: Router<[H, RouterRoute]>;
} & ({
    /**
     * `strict` option specifies whether to distinguish whether the last path is a directory or not.
     *
     *
     * @default true
     */
    strict?: true;
    /**
     * `getPath` can handle the host header value.
     *
     *
     * @example
     * ```ts
     * const app = new Acryl({
     *  getPath: (req) =>
     *   '/' + req.headers.get('host') + req.url.replace(/^https?:\/\/[^/]+(\/[^?]*)/, '$1'),
     * })
     *
     * app.get('/www1.example.com/hello', () => c.text('hello www1'))
     *
     * // A following request will match the route:
     * // new Request('http://www1.example.com/hello', {
     * //  headers: { host: 'www1.example.com' },
     * // })
     * ```
     */
    getPath?: GetPath<E>;
} | {
    /**
     * `strict` option specifies whether to distinguish whether the last path is a directory or not.
     * When `strict` is `false`, `getPath` is not used.
     *
     *
     * @default true
     */
    strict: false;
    getPath?: never;
});
type MountOptionHandler = (c: Context) => unknown;
type MountReplaceRequest = (originalRequest: Request) => Request;
type MountOptions = MountOptionHandler | {
    optionHandler?: MountOptionHandler;
    replaceRequest?: MountReplaceRequest | false;
};
declare class Acryl<E extends Env = Env, S extends Schema = {}, BasePath extends string = '/', CurrentPath extends string = BasePath> {
    #private;
    get: HandlerInterface<E, 'get', S, BasePath, CurrentPath>;
    post: HandlerInterface<E, 'post', S, BasePath, CurrentPath>;
    put: HandlerInterface<E, 'put', S, BasePath, CurrentPath>;
    delete: HandlerInterface<E, 'delete', S, BasePath, CurrentPath>;
    options: HandlerInterface<E, 'options', S, BasePath, CurrentPath>;
    patch: HandlerInterface<E, 'patch', S, BasePath, CurrentPath>;
    query: HandlerInterface<E, 'query', S, BasePath, CurrentPath>;
    all: HandlerInterface<E, 'all', S, BasePath, CurrentPath>;
    on: OnHandlerInterface<E, S, BasePath>;
    use: MiddlewareHandlerInterface<E, S, BasePath>;
    router: Router<[H, RouterRoute]>;
    readonly getPath: GetPath<E>;
    private _basePath;
    routes: RouterRoute[];
    constructor(options?: AcrylOptions<E>);
    private errorHandler;
    /**
     * `.route()` allows grouping other Acryl instance in routes.
     *
     *
     * @param {string} path - base Path
     * @param {Acryl} app - other Acryl instance
     * @returns {Acryl} routed Acryl instance
     *
     * @example
     * ```ts
     * const app = new Acryl()
     * const app2 = new Acryl()
     *
     * app2.get("/user", (c) => c.text("user"))
     * app.route("/api", app2) // GET /api/user
     * ```
     */
    route<SubPath extends string, SubEnv extends Env, SubSchema extends Schema, SubBasePath extends string, SubCurrentPath extends string>(path: SubPath, app: Acryl<SubEnv, SubSchema, SubBasePath, SubCurrentPath>): Acryl<E, MergeSchemaPath<SubSchema, MergePath<BasePath, SubPath>> | S, BasePath, CurrentPath>;
    /**
     * `.basePath()` allows base paths to be specified.
     *
     *
     * @param {string} path - base Path
     * @returns {Acryl} changed Acryl instance
     *
     * @example
     * ```ts
     * const api = new Acryl().basePath('/api')
     * ```
     */
    basePath<SubPath extends string>(path: SubPath): Acryl<E, S, MergePath<BasePath, SubPath>, MergePath<BasePath, SubPath>>;
    /**
     * `.onError()` handles an error and returns a customized Response.
     *
     *
     * @param {ErrorHandler} handler - request Handler for error
     * @returns {Acryl} changed Acryl instance
     *
     * @example
     * ```ts
     * app.onError((err, c) => {
     *   console.error(`${err}`)
     *   return c.text('Custom Error Message', 500)
     * })
     * ```
     */
    onError: (handler: ErrorHandler<E>) => Acryl<E, S, BasePath, CurrentPath>;
    /**
     * `.notFound()` allows you to customize a Not Found Response.
     *
     *
     * @param {NotFoundHandler} handler - request handler for not-found
     * @returns {Acryl} changed Acryl instance
     *
     * @example
     * ```ts
     * app.notFound((c) => {
     *   return c.text('Custom 404 Message', 404)
     * })
     * ```
     */
    notFound: (handler: NotFoundHandler<E>) => Acryl<E, S, BasePath, CurrentPath>;
    /**
     * `.mount()` allows you to mount applications built with other frameworks into your Acryl application.
     *
     * @deprecated Use `mount()` from `acryl-router/mount` instead. `.mount()` will be removed in v5.
     *
     *
     * @param {string} path - base Path
     * @param {Function} applicationHandler - other Request Handler
     * @param {MountOptions} [options] - options of `.mount()`
     * @returns {Acryl} mounted Acryl instance
     *
     * @example
     * ```ts
     * import { Router as IttyRouter } from 'itty-router'
     * import { Acryl } from 'acrylblends'
     * // Create itty-router application
     * const ittyRouter = IttyRouter()
     * // GET /itty-router/hello
     * ittyRouter.get('/hello', () => new Response('Hello from itty-router'))
     *
     * const app = new Acryl()
     * app.mount('/itty-router', ittyRouter.handle)
     * ```
     *
     * @example
     * ```ts
     * const app = new Acryl()
     * // Send the request to another application without modification.
     * app.mount('/app', anotherApp, {
     *   replaceRequest: (req) => req,
     * })
     * ```
     */
    mount(path: string, applicationHandler: (request: Request, ...args: any) => Response | Promise<Response>, options?: MountOptions): Acryl<E, S, BasePath, CurrentPath>;
    /**
     * `.fetch()` will be entry point of your app.
     *
     *
     * @param {Request} request - request Object of request
     * @param {Env} env - env Object
     * @param {ExecutionContext} executionCtx - context of execution
     * @returns {Response | Promise<Response>} response of request
     *
     */
    fetch: (request: Request, env?: E['Bindings'] | {}, executionCtx?: ExecutionContext) => Response | Promise<Response>;
    /**
     * `.request()` is a useful method for testing.
     * You can pass a URL or pathname to send a GET request.
     * app will return a Response object.
     * ```ts
     * test('GET /hello is ok', async () => {
     *   const res = await app.request('/hello')
     *   expect(res.status).toBe(200)
     * })
     * ```
     */
    request: (input: Request | string | URL, requestInit?: RequestInit, Env?: E["Bindings"] | {}, executionCtx?: ExecutionContext) => Response | Promise<Response>;
    /**
     * `.fire()` automatically adds a global fetch event listener.
     * This can be useful for environments that adhere to the Service Worker API, such as non-ES module Cloudflare Workers.
     * @deprecated
     * ACRYL ships no service-worker adapter: mount the app with `ctx.router.route(path, app)` and serve it through an ACRYL adapter instead.
     * @see https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API
     * @see https://developers.cloudflare.com/workers/reference/migrate-to-module-workers/
     */
    fire: () => void;
}
export { Acryl as AcrylBase };
