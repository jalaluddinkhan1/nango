import { toolService } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { decodeToolCursor, paginateTools } from '../../functions/tools.js';
import { listFunctionsServiceErrorToMcp } from '../functions/errors.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { PublicMcpError } from '../utils.js';
import { toolToMcp } from './formatter.js';
import { listToolsArgumentsSchema, listToolsOutputSchema } from './schema.js';

import type { ListToolsOutput } from './schema.js';

export const listToolsTool = defineManagementMcpTool<typeof listToolsArgumentsSchema, ListToolsOutput>({
    name: 'tools_list',
    title: 'List Tools',
    description:
        'Lists the enabled tools of an integration, including their input and output JSON schemas and metadata. Results are sorted by name and paginated.',
    inputSchema: listToolsArgumentsSchema,
    outputSchema: listToolsOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    requiredScopes: { every: ['environment:functions:list'] },
    audit: { kind: 'no-audit', reason: 'read-only' },
    async handler({ args, environment }) {
        const afterName = args.cursor === undefined ? undefined : decodeToolCursor(args.cursor);
        if (afterName === null) {
            return Err<ListToolsOutput, PublicMcpError>(new PublicMcpError('Invalid cursor'));
        }

        const result = await toolService.listTools({ environmentId: environment.id, integrationKey: args.integration_id });
        if (result.isErr()) {
            return Err(listFunctionsServiceErrorToMcp(result.error));
        }

        const page = paginateTools({
            tools: result.value.tools,
            integration: { unique_key: args.integration_id, provider: result.value.provider },
            afterName,
            limit: args.limit
        });

        return Ok({ data: page.data.map((tool) => toolToMcp(tool)), next_cursor: page.next_cursor });
    }
});
