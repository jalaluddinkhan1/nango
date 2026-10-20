import { configService, toolService } from '@nangohq/shared';
import { Err, getLogger, Ok } from '@nangohq/utils';

import { actionToGetToolResponse, toGetToolResponse } from '../../functions/formatter.js';
import { defineManagementMcpTool } from '../managementTool.js';
import { InternalMcpError, PublicMcpError } from '../utils.js';
import { toolToMcp } from './formatter.js';
import { getToolArgumentsSchema, getToolOutputSchema } from './schema.js';

import type { GetToolOutput } from './schema.js';

const logger = getLogger('Server.MCP.Tools');

export const getToolsTool = defineManagementMcpTool<typeof getToolArgumentsSchema, GetToolOutput>({
    name: 'tools_get',
    title: 'Get Tool',
    description: 'Returns an enabled tool of an integration by name, including its input and output JSON schemas and metadata.',
    inputSchema: getToolArgumentsSchema,
    outputSchema: getToolOutputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    requiredScopes: { every: ['environment:functions:read'] },
    audit: { kind: 'no-audit', reason: 'read-only' },
    async handler({ args, environment, account }) {
        const notFound = () =>
            Err<GetToolOutput, PublicMcpError>(new PublicMcpError(`Tool '${args.name}' for integration '${args.integration_id}' was not found`));

        const integration = await configService.getProviderConfig(args.integration_id, environment.id);
        if (!integration) {
            return notFound();
        }

        const resolved = await toolService.resolveTool({
            accountUuid: account.uuid,
            environmentId: environment.id,
            integration,
            name: args.name
        });
        if (resolved.isErr()) {
            logger.error('Failed to resolve tool', { err: resolved.error });
            return Err<GetToolOutput>(new InternalMcpError());
        }

        const tool = resolved.value;
        if (tool.kind === 'function') {
            return Ok(toolToMcp(toGetToolResponse(tool.fn)));
        } else if (tool.kind !== 'missing') {
            return Ok(toolToMcp(actionToGetToolResponse(tool, integration)));
        }

        return notFound();
    }
});
