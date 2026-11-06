import { ApiError } from '../../shell';

/** The code a guarded route answers with when the browser has no session (survey 18 §4). */
export const AUTH_REQUIRED_CODE = 'AUTH_REQUIRED';

/** True when the call failed because this browser is not signed in. The page shows the sign-in notice. */
export function isSignInError(error: unknown): boolean {
  return error instanceof ApiError && error.code === AUTH_REQUIRED_CODE;
}

/** The text a failed call shows. A Platform error keeps its message, which never names a secret. */
export function messageOf(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'The request failed. Check that the server is running.';
}
