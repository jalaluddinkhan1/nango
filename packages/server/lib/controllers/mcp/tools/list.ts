import { toolService } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { listedActionToGetToolResponse, toGetToolResponse } from '../../functions/formatter.js';
import { listFunctionsServiceErrorToMcp } from '../functions/errors.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { PublicMcpError } from '../utils.js';
import { toolToMcp } from './formatter.js';
import { listToolsArgumentsSchema, listToolsOutputSchema } from './schema.js';

import type { ListToolsOutput } from './schema.js';

function encodeCursor(name: string): string {
    return Buffer.from(name, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): string | null {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    return decoded && encodeCursor(decoded) === cursor ? decoded : null;
}

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
        const afterName = args.cursor === undefined ? undefined : decodeCursor(args.cursor);
        if (afterName === null) {
            return Err<ListToolsOutput, PublicMcpError>(new PublicMcpError('Invalid cursor'));
        }

        const result = await toolService.listTools({ environmentId: environment.id, integrationKey: args.integration_id });
        if (result.isErr()) {
            return Err(listFunctionsServiceErrorToMcp(result.error));
        }

        const integration = { unique_key: args.integration_id, provider: result.value.provider };
        const sorted = result.value.tools
            .map((tool) => (tool.kind === 'function' ? toGetToolResponse(tool.fn) : listedActionToGetToolResponse(tool.action, integration)))
            .filter((tool) => afterName === undefined || tool.name > afterName)
            .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
        const page = sorted.slice(0, args.limit);
        const last = page.at(-1);

        return Ok({
            data: page.map((tool) => toolToMcp(tool)),
            next_cursor: sorted.length > args.limit && last ? encodeCursor(last.name) : null
        });
    }
});
