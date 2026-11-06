import { coerceMCPToolInput } from '~/mcp/tools';

describe('coerceMCPToolInput', () => {
  const sampleSchema = {
    type: 'object',
    properties: {
      query: { type: 'string' },
      limit: { type: 'integer' },
      threshold: { type: 'number' },
      recursive: { type: 'boolean' },
      tags: { type: 'array', items: { type: 'string' } },
      filter: {
        type: 'object',
        properties: {
          minScore: { type: 'number' },
          includeArchived: { type: 'boolean' },
          note: { type: 'string' },
        },
        required: ['minScore'],
      },
      nullableNote: {
        anyOf: [{ type: 'string' }, { type: 'null' }],
      },
      unionCount: {
        oneOf: [{ type: 'integer' }, { type: 'null' }],
      },
    },
    required: ['query'],
  };

  it('returns non-object inputs or inputs with missing schema properties unchanged', () => {
    expect(coerceMCPToolInput(null, sampleSchema)).toBeNull();
    expect(coerceMCPToolInput(undefined, sampleSchema)).toBeUndefined();
    expect(coerceMCPToolInput('raw' as unknown as Record<string, unknown>, sampleSchema)).toBe(
      'raw',
    );
    expect(coerceMCPToolInput(['a'] as unknown as Record<string, unknown>, sampleSchema)).toEqual([
      'a',
    ]);
    const input = { query: 'hello' };
    expect(coerceMCPToolInput(input, null)).toBe(input);
    expect(coerceMCPToolInput(input, {})).toBe(input);
  });

  it('does not mutate the original input object', () => {
    const input = { query: 'search', limit: '25', threshold: null };
    const snapshot = { ...input };
    const result = coerceMCPToolInput(input, sampleSchema);

    expect(input).toEqual(snapshot);
    expect(result).toEqual({ query: 'search', limit: 25 });
  });

  it('strips null on optional fields that do not allow null, while preserving allowed or required nulls', () => {
    const input = {
      query: null,
      limit: null,
      nullableNote: null,
    };

    const result = coerceMCPToolInput(input, sampleSchema);
    expect(result).toEqual({
      query: null,
      nullableNote: null,
    });
    expect('limit' in result).toBe(false);
  });

  it('strips empty strings on optional non-string fields while preserving empty strings on string fields', () => {
    const input = {
      query: '',
      limit: '',
      threshold: '',
      recursive: '',
    };

    const result = coerceMCPToolInput(input, sampleSchema);
    expect(result).toEqual({
      query: '',
    });
    expect('limit' in result).toBe(false);
    expect('threshold' in result).toBe(false);
    expect('recursive' in result).toBe(false);
  });

  it('coerces stringified integers and numbers when valid', () => {
    const result = coerceMCPToolInput(
      {
        query: 'docs',
        limit: ' 42 ',
        threshold: '-0.75',
        unionCount: '10',
      },
      sampleSchema,
    );

    expect(result).toEqual({
      query: 'docs',
      limit: 42,
      threshold: -0.75,
      unionCount: 10,
    });
  });

  it('does not coerce non-integer float strings into integer fields', () => {
    const result = coerceMCPToolInput(
      {
        query: 'docs',
        limit: '3.14',
      },
      sampleSchema,
    );

    expect(result.limit).toBe('3.14');
  });

  it('coerces case-insensitive boolean strings on boolean fields', () => {
    expect(
      coerceMCPToolInput({ query: 'a', recursive: 'true' }, sampleSchema).recursive,
    ).toBe(true);
    expect(
      coerceMCPToolInput({ query: 'a', recursive: ' FALSE ' }, sampleSchema).recursive,
    ).toBe(false);
    expect(
      coerceMCPToolInput({ query: 'a', recursive: 'yes' }, sampleSchema).recursive,
    ).toBe('yes');
  });

  it('parses stringified JSON arrays and recursively coerces stringified JSON objects', () => {
    const result = coerceMCPToolInput(
      {
        query: 'items',
        tags: '["alpha", "beta"]',
        filter: '{"minScore": "0.85", "includeArchived": "true", "note": null}',
      },
      sampleSchema,
    );

    expect(result).toEqual({
      query: 'items',
      tags: ['alpha', 'beta'],
      filter: {
        minScore: 0.85,
        includeArchived: true,
      },
    });
  });

  it('recursively coerces nested object values passed directly as objects', () => {
    const result = coerceMCPToolInput(
      {
        query: 'items',
        filter: {
          minScore: '0.5',
          includeArchived: 'false',
          note: null,
        },
      },
      sampleSchema,
    );

    expect(result).toEqual({
      query: 'items',
      filter: {
        minScore: 0.5,
        includeArchived: false,
      },
    });
  });

  it('leaves malformed JSON strings untouched without throwing', () => {
    const result = coerceMCPToolInput(
      {
        query: 'items',
        tags: '[invalid json]',
        filter: '{broken: true}',
      },
      sampleSchema,
    );

    expect(result).toEqual({
      query: 'items',
      tags: '[invalid json]',
      filter: '{broken: true}',
    });
  });
});
