import { z } from 'zod';
import { PreflightSummarySchema } from './preflight.js';
import { ExportFormatSchema } from './vocabulary.js';

/**
 * Export request and result (spec, "Export"). A `GET` download streams the file and has no side
 * effects, so the download is a route constant (`routes.ts`) and has no body shape here.
 */

/** Export request (spec): `{format}`. Format values are `md | docx | epub | pdf`. */
export const ExportRequestSchema = z.strictObject({
  format: ExportFormatSchema,
});
export type ExportRequest = z.infer<typeof ExportRequestSchema>;

/**
 * Export result (spec): `{format, fileName, bytes, downloadUrl, preflight, warnings}`. `preflight`
 * is the summary, so an export that has preflight errors still reports them. `warnings` are Pandoc's
 * stderr warnings (spec). The file name is built from the title, the format and a timestamp, so it
 * ends with the format's extension. `downloadUrl` is [proposed] as a route path.
 */
export const ExportResultSchema = z
  .strictObject({
    format: ExportFormatSchema,
    fileName: z.string().min(1),
    bytes: z.int().nonnegative(),
    downloadUrl: z.string().min(1),
    preflight: PreflightSummarySchema,
    warnings: z.array(z.string()),
  })
  .superRefine((result, ctx) => {
    if (!result.fileName.endsWith(`.${result.format}`)) {
      ctx.addIssue({
        code: 'custom',
        message: 'the file name must end with the format extension',
        path: ['fileName'],
      });
    }
  });
export type ExportResult = z.infer<typeof ExportResultSchema>;
