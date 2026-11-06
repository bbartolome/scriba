import { z } from 'zod';
import { ProjectYamlSchema } from '../project-store/index.js';
import { OrderFieldSchema } from './order.js';
import { ExportSettingsSchema } from './settings.js';

/**
 * The `project.yaml` schema narrowed for Compile & export (spec, "Phases", `phase:contract`). The
 * Project store reserves `order` and `export` as passthrough values. This slice narrows them to
 * `OrderEntry[]` and `ExportSettings` for writes.
 *
 * The narrowing lives here, and the Project store's own schema is unchanged. Survey 25 §7 item 20
 * recommends that: `schemaVersion` stays 1, and a narrowed field is checked on write only. A read
 * uses the Project store's schema and the read forms in `order.ts` and `settings.ts`.
 */
// provisional: survey 25 §7 item 20
export const NarrowedProjectYamlSchema = ProjectYamlSchema.extend({
  order: OrderFieldSchema.optional(),
  export: ExportSettingsSchema.optional(),
});
export type NarrowedProjectYaml = z.infer<typeof NarrowedProjectYamlSchema>;
