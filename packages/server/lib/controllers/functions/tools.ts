import { listedActionToGetToolResponse, toGetToolResponse } from './formatter.js';

import type { ListedTool } from '@nangohq/shared';
import type { GetToolResponse } from '@nangohq/types';

export function encodeToolCursor(name: string): string {
    return Buffer.from(name, 'utf8').toString('base64url');
}

export function decodeToolCursor(cursor: string): string | null {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    return decoded && encodeToolCursor(decoded) === cursor ? decoded : null;
}

export function paginateTools({
    tools,
    integration,
    afterName,
    limit
}: {
    tools: ListedTool[];
    integration: { unique_key: string; provider: string };
    afterName: string | undefined;
    limit: number;
}): { data: GetToolResponse[]; next_cursor: string | null } {
    const sorted = tools
        .map((tool) => ({ name: tool.kind === 'function' ? tool.fn.config.name : tool.action.name, tool }))
        .filter(({ name }) => afterName === undefined || name > afterName)
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const page = sorted.slice(0, limit);
    const last = page.at(-1);
    return {
        data: page.map(({ tool }) => (tool.kind === 'function' ? toGetToolResponse(tool.fn) : listedActionToGetToolResponse(tool.action, integration))),
        next_cursor: sorted.length > limit && last ? encodeToolCursor(last.name) : null
    };
}
