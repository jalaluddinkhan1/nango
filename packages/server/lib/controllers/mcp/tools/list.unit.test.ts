import { afterEach, describe, expect, it, vi } from 'vitest';

import { legacyFunctionService, toolService } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { InternalMcpError, PublicMcpError } from '../utils.js';
import { listToolsTool } from './list.js';
import { listToolsOutputSchema } from './schema.js';

import type { ManagementMcpContext } from '../managementTool.js';
import type { functionConfigService } from '@nangohq/shared';
import type { FunctionTags, ListedNangoActionFunction } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

describe('listToolsTool', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns functions and actions sorted by name with resolved schemas and meta', async () => {
        const list = vi.spyOn(toolService, 'listTools').mockResolvedValue(
            Ok({
                tools: [
                    { kind: 'function', fn: functionFixture },
                    { kind: 'action', action: actionFixture }
                ],
                provider: 'github'
            })
        );

        const result = await listToolsTool.handler({ integration_id: 'github' }, context);

        expect(list).toHaveBeenCalledWith({ environmentId: 42, integrationKey: 'github' });
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual({
                data: [
                    {
                        uuid: null,
                        integration_id: 'github',
                        provider: 'github',
                        name: 'createIssue',
                        description: 'Create an issue',
                        input_json_schema: {
                            $ref: '#/definitions/Input',
                            definitions: { Input: { type: 'object', properties: { id: { type: 'string' } } } }
                        },
                        output_json_schema: {
                            $ref: '#/definitions/Output',
                            definitions: { Output: { type: 'object', properties: { title: { type: 'string' } } } }
                        },
                        source: 'tools-catalog',
                        meta: { instructions: undefined, required_scopes: ['repo'], tags: {} }
                    },
                    {
                        uuid: '11111111-1111-4111-8111-111111111111',
                        integration_id: 'github',
                        provider: 'github',
                        name: 'fetchIssue',
                        description: 'Fetch an issue',
                        input_json_schema: {
                            $ref: '#/definitions/Input',
                            definitions: { Input: { type: 'object', properties: { id: { type: 'string' } } } }
                        },
                        output_json_schema: {
                            $ref: '#/definitions/Output',
                            definitions: { Output: { type: 'object', properties: { title: { type: 'string' } } } }
                        },
                        source: 'repo',
                        meta: { instructions: 'Use with care', required_scopes: ['repo'], tags: { category: 'crm' } }
                    }
                ],
                next_cursor: null
            });
            expect(listToolsOutputSchema.parse(result.value)).toStrictEqual(result.value);
        }
    });

    it('paginates with a cursor', async () => {
        vi.spyOn(toolService, 'listTools').mockResolvedValue(
            Ok({
                tools: ['c', 'a', 'b'].map((name) => ({ kind: 'action' as const, action: { ...actionFixture, name } })),
                provider: 'github'
            })
        );

        const first = await listToolsTool.handler({ integration_id: 'github', limit: 2 }, context);
        expect(first.isOk()).toBe(true);
        if (!first.isOk()) {
            return;
        }
        expect(first.value.data.map((tool) => tool.name)).toStrictEqual(['a', 'b']);
        expect(first.value.next_cursor).toEqual(expect.any(String));

        const second = await listToolsTool.handler({ integration_id: 'github', limit: 2, cursor: first.value.next_cursor }, context);
        expect(second.isOk()).toBe(true);
        if (second.isOk()) {
            expect(second.value.data.map((tool) => tool.name)).toStrictEqual(['c']);
            expect(second.value.next_cursor).toBeNull();
        }
    });

    it('rejects an invalid cursor', async () => {
        const list = vi.spyOn(toolService, 'listTools');

        const result = await listToolsTool.handler({ integration_id: 'github', cursor: 'not a cursor' }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toBe('Invalid cursor');
        }
        expect(list).not.toHaveBeenCalled();
    });

    it.each([
        { name: 'missing integration ID', args: {} },
        { name: 'unknown argument', args: { integration_id: 'github', unexpected: true } },
        { name: 'invalid integration ID', args: { integration_id: 'github#' } },
        { name: 'zero limit', args: { integration_id: 'github', limit: 0 } },
        { name: 'limit above max', args: { integration_id: 'github', limit: 101 } },
        { name: 'empty cursor', args: { integration_id: 'github', cursor: '' } }
    ])('rejects $name', async ({ args }) => {
        const result = await listToolsTool.handler(args, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain('Invalid tools_list arguments:');
        }
    });

    it('returns a public error when the integration does not exist', async () => {
        vi.spyOn(toolService, 'listTools').mockResolvedValue(
            Err(new legacyFunctionService.ListFunctionsError({ code: 'integration_not_found', message: "Integration 'github' was not found" }))
        );

        const result = await listToolsTool.handler({ integration_id: 'github' }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toBe("Integration 'github' was not found");
        }
    });

    it('returns an internal error when listing fails', async () => {
        vi.spyOn(toolService, 'listTools').mockResolvedValue(
            Err(new legacyFunctionService.ListFunctionsError({ code: 'list_failed', message: 'Failed to list functions' }))
        );

        const result = await listToolsTool.handler({ integration_id: 'github' }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(InternalMcpError);
        }
    });
});

const context = {
    account: { uuid: '8d49e079-aa61-44ae-b0cf-823662523527' },
    environment: { id: 42 },
    grantedScopes: ['environment:functions:list']
} as ManagementMcpContext;

const jsonSchema: JSONSchema7 = {
    definitions: {
        Input: { type: 'object', properties: { id: { type: 'string' } } },
        Output: { type: 'object', properties: { title: { type: 'string' } } }
    }
};

const tags: FunctionTags = { instructions: 'Use with care', required_scopes: ['repo'], category: 'crm' };

const actionFixture = {
    id: null,
    name: 'createIssue',
    type: 'action',
    description: 'Create an issue',
    scopes: ['repo'],
    enabled: true,
    last_deployed: null,
    source: 'tools-catalog',
    input: 'Input',
    returns: ['Output'],
    json_schema: jsonSchema
} as unknown as ListedNangoActionFunction;

const functionFixture = {
    config: { uuid: '11111111-1111-4111-8111-111111111111', name: 'fetchIssue', enabled: true, created_at: new Date(), updated_at: new Date() },
    integration: { id: 1, unique_key: 'github', provider: 'github' },
    currentVersion: {
        description: 'Fetch an issue',
        tags,
        source: 'repo' as const,
        json_schema: jsonSchema,
        input_schema_ref: '#/definitions/Input',
        output_schema_ref: '#/definitions/Output'
    }
} as functionConfigService.CurrentFunctionConfig;
