import { fileURLToPath } from 'node:url';

/**
 * The apps/api directory. This file sits four levels below it under both src/ and dist/, so the
 * same relative offset works from either build output.
 */
export const API_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
