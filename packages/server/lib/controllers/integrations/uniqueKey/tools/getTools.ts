import tracer from 'dd-trace';
import * as z from 'zod';

import { toolService } from '@nangohq/shared';
import { zodErrorToHTTP } from '@nangohq/utils';

import { asyncWrapperWithEnvironment } from '../../../../utils/asyncWrapper.js';
import { decodeToolCursor, paginateTools } from '../../../functions/tools.js';
import { functionIntegrationIdSchema } from '../../../functions/validation.js';

import type { GetTools } from '@nangohq/types';

const paramsSchema = z.object({ uniqueKey: functionIntegrationIdSchema }).strict();

const querySchema = z
    .object({
        cursor: z
            .string()
            .min(1)
            .max(1024)
            .transform((cursor, ctx) => {
                const decoded = decodeToolCursor(cursor);
                if (decoded === null) {
                    ctx.addIssue({ code: 'custom', message: 'invalid cursor' });
                    return z.NEVER;
                }
                return decoded;
            })
            .optional(),
        limit: z.coerce.number().int().min(1).max(250).optional().default(250)
    })
    .strict();

export const getTools = asyncWrapperWithEnvironment<GetTools>(async (req, res) => {
    const query = querySchema.safeParse(req.query);
    if (!query.success) {
        res.status(400).send({ error: { code: 'invalid_query_params', errors: zodErrorToHTTP(query.error) } });
        return;
    }

    const params = paramsSchema.safeParse(req.params);
    if (!params.success) {
        res.status(400).send({ error: { code: 'invalid_uri_params', errors: zodErrorToHTTP(params.error) } });
        return;
    }

    const { environment } = res.locals;
    const { uniqueKey } = params.data;
    const { cursor: afterName, limit } = query.data;

    try {
        const result = await toolService.listTools({ environmentId: environment.id, integrationKey: uniqueKey });
        if (result.isErr()) {
            if (result.error.code === 'integration_not_found') {
                res.status(404).send({ error: { code: 'not_found', message: `Integration ${uniqueKey} was not found` } });
                return;
            }
            throw result.error;
        }
        res.status(200).send(
            paginateTools({ tools: result.value.tools, integration: { unique_key: uniqueKey, provider: result.value.provider }, afterName, limit })
        );
    } catch (err) {
        tracer.scope().active()?.setTag('error', err);
        res.status(500).send({ error: { code: 'server_error', message: 'Failed to list tools' } });
    }
});
