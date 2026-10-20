import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configService, toolService } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { InternalMcpError, PublicMcpError } from '../utils.js';
import { getToolsTool } from './get.js';
import { getToolOutputSchema } from './schema.js';

import type { ManagementMcpContext } from '../managementTool.js';
import type { Config, functionConfigService } from '@nangohq/shared';
import type { DBSyncConfig, FunctionTags } from '@nangohq/types';
import type { JSONSchema7 } from 'json-schema';

describe('getToolsTool', () => {
    beforeEach(() => {
        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue(integration);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns the tool with resolved schemas and meta', async () => {
        const lookup = vi.spyOn(configService, 'getProviderConfig');
        vi.spyOn(toolService, 'resolveTool').mockResolvedValue(Ok({ kind: 'function', fn: functionFixture }));

        const result = await getToolsTool.handler({ integration_id: 'github', name: 'fetchIssue' }, context);

        expect(lookup).toHaveBeenCalledWith('github', 42);
        expect(toolService.resolveTool).toHaveBeenCalledWith({ accountUuid, environmentId: 42, integration, name: 'fetchIssue' });
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toStrictEqual({
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
                meta: {
                    instructions: 'Use with care',
                    required_scopes: ['repo'],
                    tags: { category: 'crm' }
                }
            });
            expect(getToolOutputSchema.parse(result.value)).toStrictEqual(result.value);
        }
    });

    it.each([
        { name: 'missing name', args: { integration_id: 'github' } },
        { name: 'missing integration ID', args: { name: 'fetchIssue' } },
        { name: 'unknown argument', args: { integration_id: 'github', name: 'fetchIssue', unexpected: true } },
        { name: 'invalid name', args: { integration_id: 'github', name: 'not a name' } },
        { name: 'invalid integration ID', args: { integration_id: 'github#', name: 'fetchIssue' } },
        { name: 'dot integration ID', args: { integration_id: '.', name: 'fetchIssue' } },
        { name: 'parent integration ID', args: { integration_id: '..', name: 'fetchIssue' } }
    ])('rejects $name', async ({ args }) => {
        const result = await getToolsTool.handler(args, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toContain('Invalid tools_get arguments:');
        }
    });

    it('returns an error when the tool does not exist', async () => {
        vi.spyOn(toolService, 'resolveTool').mockResolvedValue(Ok({ kind: 'missing' }));

        const result = await getToolsTool.handler({ integration_id: 'github', name: 'missing' }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toBe("Tool 'missing' for integration 'github' was not found");
        }
    });

    it('returns an internal error when the tool cannot be resolved', async () => {
        vi.spyOn(toolService, 'resolveTool').mockResolvedValue(Err(new Error('failed_to_resolve_tool')));

        const result = await getToolsTool.handler({ integration_id: 'github', name: 'fetchIssue' }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(InternalMcpError);
        }
    });

    it('returns an error when the integration does not exist', async () => {
        vi.spyOn(configService, 'getProviderConfig').mockResolvedValue(null);
        const resolve = vi.spyOn(toolService, 'resolveTool');

        const result = await getToolsTool.handler({ integration_id: 'github', name: 'fetchIssue' }, context);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(PublicMcpError);
            expect(result.error.message).toBe("Tool 'fetchIssue' for integration 'github' was not found");
        }
        expect(resolve).not.toHaveBeenCalled();
    });

    it('throws when the integration lookup fails', async () => {
        vi.spyOn(configService, 'getProviderConfig').mockRejectedValue(new Error('lookup failed'));

        await expect(getToolsTool.handler({ integration_id: 'github', name: 'fetchIssue' }, context)).rejects.toThrow('lookup failed');
    });

    it('returns a deployed action', async () => {
        vi.spyOn(toolService, 'resolveTool').mockResolvedValue(Ok({ kind: 'deployed', config: actionFixture }));

        const result = await getToolsTool.handler({ integration_id: 'github', name: 'fetchIssue' }, context);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toMatchObject({
                uuid: null,
                name: 'fetchIssue',
                source: 'repo',
                input_json_schema: { $ref: '#/definitions/Input' },
                output_json_schema: { $ref: '#/definitions/Output' },
                meta: { required_scopes: ['repo'], tags: {} }
            });
            expect(getToolOutputSchema.parse(result.value)).toStrictEqual(result.value);
        }
    });

    it('returns a catalog action', async () => {
        vi.spyOn(toolService, 'resolveTool').mockResolvedValue(
            Ok({
                kind: 'catalog',
                tool: {
                    name: 'fetchIssue',
                    description: 'Fetch an issue',
                    input: 'Input',
                    output: ['Output'],
                    scopes: ['repo'],
                    jsonSchema,
                    version: '1',
                    sdkVersion: '1-zero',
                    fileLocation: 'fetchIssue.js',
                    sourceLocation: 'fetchIssue.ts',
                    capabilities: { usesRecords: false, usesOutbound: false, usesCheckpoints: false, usesMetadata: false, usesInvoke: false },
                    module: 'action'
                }
            })
        );

        const result = await getToolsTool.handler({ integration_id: 'github', name: 'fetchIssue' }, context);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
            expect(result.value).toMatchObject({
                uuid: null,
                source: 'tools-catalog',
                name: 'fetchIssue',
                input_json_schema: { $ref: '#/definitions/Input' },
                output_json_schema: { $ref: '#/definitions/Output' },
                meta: { required_scopes: ['repo'], tags: {} }
            });
            expect(getToolOutputSchema.parse(result.value)).toStrictEqual(result.value);
        }
    });
});

const accountUuid = '8d49e079-aa61-44ae-b0cf-823662523527';

const integration = { id: 1, unique_key: 'github', provider: 'github' } as Config;

const context = {
    account: { uuid: accountUuid },
    environment: { id: 42 },
    grantedScopes: ['environment:functions:read']
} as ManagementMcpContext;

const jsonSchema: JSONSchema7 = {
    definitions: {
        Input: { type: 'object', properties: { id: { type: 'string' } } },
        Output: { type: 'object', properties: { title: { type: 'string' } } }
    }
};

const tags: FunctionTags = { instructions: 'Use with care', required_scopes: ['repo'], category: 'crm' };

const actionFixture = {
    sync_name: 'fetchIssue',
    enabled: true,
    source: 'repo',
    input: 'Input',
    models: ['Output'],
    models_json_schema: jsonSchema,
    metadata: { description: 'Fetch an issue', scopes: ['repo'] }
} as DBSyncConfig;

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
