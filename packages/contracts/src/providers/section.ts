import { z } from 'zod';
import { ProviderConfigSchema } from './config.js';
import { ModelChoiceSchema } from './model.js';

/**
 * The `providers` section of `settings.yaml` (spec #19, "Registry and storage"). The spec says
 * "a list", so the shape is [proposed] (survey 19 §4): the app default and the provider list.
 */
export const ProvidersSectionSchema = z
  .strictObject({
    appDefault: ModelChoiceSchema,
    list: z.array(ProviderConfigSchema),
  })
  .refine(
    (section) => new Set(section.list.map((provider) => provider.id)).size === section.list.length,
    {
      message: 'provider ids must be unique',
      path: ['list'],
    },
  );
export type ProvidersSection = z.infer<typeof ProvidersSectionSchema>;
