import { Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  HANDSHAKE_REDIRECT_STATUS,
  HANDSHAKE_REDIRECT_TARGETS,
  HandshakeQuerySchema,
} from '@bbartolome/scriba-contracts/setup-auth';
import { Public } from '../../common/public.js';
import { ApiException } from '../platform/index.js';
import { hasSession } from './guard.js';
import { sessionClearCookie, sessionSetCookie, signSession } from './session.js';
import { currentSetupToken } from './state.js';
import { tokensMatch } from './token/setup-token.js';

/** The explanatory page for a wrong or missing token. It names no token and sets no cookie. */
const INVALID_PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Setup link not valid</title></head>
<body>
<h1>This setup link is not valid</h1>
<p>Open the newest setup link from the server log, or the setup-url file in the library's
.scriba folder. Each start writes a new link, so an old one stops working when the token changes.</p>
<p>Error code: SETUP_TOKEN_INVALID</p>
</body>
</html>
`;

/** Sends the invalid-token page. The framing header stops the page being embedded elsewhere. */
function sendInvalidPage(response: Response): void {
  response.status(401);
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  response.end(INVALID_PAGE);
}

/**
 * The setup-auth routes that the guard exempts or limits: the token handshake and identity are
 * public, and sign-out is a guarded mutation. The paths come from the contract.
 */
@Controller('api/setup-auth')
export class SetupAuthController {
  /**
   * The setup URL's target. A valid token sets the session cookie and redirects to `/setup`, with no
   * token in the URL. A wrong token gets the explanatory page and no cookie.
   */
  @Public()
  @Get('handshake')
  handshake(@Query() query: Record<string, unknown>, @Res() response: Response): void {
    response.setHeader('Referrer-Policy', 'no-referrer');
    const parsed = HandshakeQuerySchema.safeParse(query);
    const stored = currentSetupToken();
    if (!parsed.success || stored === undefined || !tokensMatch(parsed.data.token, stored)) {
      sendInvalidPage(response);
      return;
    }
    const now = Math.floor(Date.now() / 1000);
    response.setHeader('Set-Cookie', sessionSetCookie(signSession(stored, now)));
    response.setHeader('Location', HANDSHAKE_REDIRECT_TARGETS.setup);
    response.status(HANDSHAKE_REDIRECT_STATUS).end();
  }

  /** Public: it answers 401 `AUTH_REQUIRED` when there is no session. */
  @Public()
  @Get('identity')
  identity(@Req() request: Request): { signedIn: true } {
    if (!hasSession(request)) {
      throw new ApiException(401, 'AUTH_REQUIRED', 'Sign in with the setup link.');
    }
    return { signedIn: true };
  }

  /** Expires the session cookie in this browser. A guarded mutation. */
  @Post('sign-out')
  @HttpCode(204)
  signOut(@Res({ passthrough: true }) response: Response): void {
    response.setHeader('Set-Cookie', sessionClearCookie());
  }
}
