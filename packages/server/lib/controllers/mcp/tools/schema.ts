import * as z from 'zod/v4';

import { scriptNameSchema } from '../../../helpers/validation.js';
import { functionIntegrationIdSchema } from '../../functions/validation.js';
import { functionSourceSchema, jsonSchemaSchema } from '../functions/schema.js';

export const getToolArgumentsSchema = z
    .object({
        integration_id: functionIntegrationIdSchema,
        name: scriptNameSchema
    })
    .strict();

export const getToolOutputSchema = z
    .object({
        uuid: z.string().uuid().nullable(),
        integration_id: z.string(),
        provider: z.string(),
        name: z.string(),
        description: z.string(),
        input_json_schema: jsonSchemaSchema.nullable(),
        output_json_schema: jsonSchemaSchema.nullable(),
        source: functionSourceSchema,
        meta: z
            .object({
                instructions: z.string().optional(),
                required_scopes: z.array(z.string()).optional(),
                tags: z.record(z.string(), z.union([z.string(), z.array(z.string())]))
            })
            .strict()
    })
    .strict();

export type GetToolOutput = z.infer<typeof getToolOutputSchema>;

export const listToolsArgumentsSchema = z
    .object({
        integration_id: functionIntegrationIdSchema,
        cursor: z.string().min(1).max(1024).optional(),
        limit: z.number().int().min(1).max(100).optional().default(20)
    })
    .strict();

export const listToolsOutputSchema = z
    .object({
        data: z.array(getToolOutputSchema),
        next_cursor: z.string().nullable()
    })
    .strict();

export type ListToolsOutput = z.infer<typeof listToolsOutputSchema>;
