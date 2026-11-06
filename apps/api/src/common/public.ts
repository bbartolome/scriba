import { SetMetadata } from '@nestjs/common';

/** The metadata key the global guard reads. A route that is marked public needs no credential. */
export const IS_PUBLIC_KEY = 'scriba:public';

/**
 * Marks a route as public. The Host and Origin checks still apply to it, except for `/healthz`,
 * which the global guard exempts by path (survey #18, "The guard").
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
