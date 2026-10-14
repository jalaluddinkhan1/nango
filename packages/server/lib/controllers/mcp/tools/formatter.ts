import type { GetToolOutput } from './schema.js';
import type { GetToolResponse } from '@nangohq/types';

export function toolToMcp(tool: GetToolResponse): GetToolOutput {
    return {
        uuid: tool.uuid,
        integration_id: tool.integration_id,
        provider: tool.provider,
        name: tool.name,
        description: tool.description,
        input_json_schema: tool.input_json_schema,
        output_json_schema: tool.output_json_schema,
        source: tool.source,
        meta: {
            instructions: tool.meta.instructions,
            required_scopes: tool.meta.required_scopes,
            tags: tool.meta.tags
        }
    };
}
