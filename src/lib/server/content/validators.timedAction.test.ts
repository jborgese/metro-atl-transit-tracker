import { describe, expect, it } from 'vitest';
import { ContentStoreError } from './errors';
import { generateTimedActionId, toTimedActionCreate, toTimedActionReplace } from './validators';

const today = '2026-11-13';
const valid = {
  goal_id: 'regional-beltline-rail',
  description: 'Comment on the study.',
  link: { label: 'Submit a comment', url: 'https://beltline.org/x' },
  location: null,
  expires_on: '2026-11-30',
};

describe('toTimedActionCreate', () => {
  it('accepts a valid create', () => {
    expect(toTimedActionCreate(valid, today)).toEqual(valid);
  });

  it('nulls an omitted link and location', () => {
    const { link: _link, location: _location, ...body } = valid;
    expect(toTimedActionCreate(body, today)).toEqual({ ...body, link: null, location: null });
  });

  it('accepts and discards provenance', () => {
    const result = toTimedActionCreate({ ...valid, provenance: { updated_by: 'Jared B.' } }, today);
    expect(result).toEqual(valid);
    expect(result).not.toHaveProperty('provenance');
    expect(Object.keys(result).sort()).toEqual([
      'description',
      'expires_on',
      'goal_id',
      'link',
      'location',
    ]);
  });

  it.each([
    ['unknown key', { ...valid, locaton: null }, 'locaton'],
    ['javascript url', { ...valid, link: { label: 'x', url: 'javascript:alert(1)' } }, 'link.url'],
    ['past date', { ...valid, expires_on: '2026-11-12' }, 'expires_on'],
    [
      'overlong url',
      { ...valid, link: { label: 'x', url: `https://a.example/${'x'.repeat(2031)}` } },
      'link.url',
    ],
    [
      'url with credentials',
      { ...valid, link: { label: 'x', url: 'https://user:pw@example.com/' } },
      'link.url',
    ],
  ])('rejects %s with a 400 naming the field', (_name, input, field) => {
    expect.assertions(3);
    try {
      toTimedActionCreate(input, today);
    } catch (err) {
      expect(err).toBeInstanceOf(ContentStoreError);
      expect((err as ContentStoreError).status).toBe(400);
      expect((err as ContentStoreError).message).toContain(field);
    }
  });

  it('trims the link url', () => {
    const result = toTimedActionCreate(
      { ...valid, link: { label: 'x', url: '  https://a.example/x  ' } },
      today,
    );
    expect(result.link?.url).toBe('https://a.example/x');
  });

  it.each([
    ['client id', { ...valid, id: 'ta-abcdefgh' }],
    ['link without url', { ...valid, link: { label: 'x' } }],
    ['blank label', { ...valid, link: { label: '   ', url: 'https://a.example' } }],
    ['empty location', { ...valid, location: {} }],
    ['impossible date', { ...valid, expires_on: '2026-02-30' }],
    ['too far out', { ...valid, expires_on: '2027-11-15' }],
    ['description too long', { ...valid, description: 'x'.repeat(301) }],
    ['label too long', { ...valid, link: { label: 'x'.repeat(41), url: 'https://a.example' } }],
    ['archive field', { ...valid, is_archived: true }],
  ])('rejects %s on create', (_name, input) => {
    expect(() => toTimedActionCreate(input, today)).toThrow(ContentStoreError);
  });

  it('accepts today and today plus 366 days', () => {
    expect(() => toTimedActionCreate({ ...valid, expires_on: '2026-11-13' }, today)).not.toThrow();
    expect(() => toTimedActionCreate({ ...valid, expires_on: '2027-11-14' }, today)).not.toThrow();
  });
});

describe('toTimedActionReplace', () => {
  it('nulls omitted buttons, drops provenance, tolerates the path id', () => {
    const body = {
      id: 'ta-abcdefgh',
      goal_id: valid.goal_id,
      description: 'New text',
      expires_on: '2026-11-30',
      provenance: { updated_by: 'Jared B.' },
    };
    expect(toTimedActionReplace(body, 'ta-abcdefgh', '2026-11-30', today)).toEqual({
      goal_id: valid.goal_id,
      description: 'New text',
      link: null,
      location: null,
      expires_on: '2026-11-30',
    });
  });

  it('rejects a mismatched id and a partial body', () => {
    expect(() =>
      toTimedActionReplace({ ...valid, id: 'ta-zzzzzzzz' }, 'ta-abcdefgh', '2026-11-30', today),
    ).toThrow(ContentStoreError);
    expect(() =>
      toTimedActionReplace({ expires_on: '2026-12-05' }, 'ta-abcdefgh', '2026-11-30', today),
    ).toThrow(ContentStoreError);
  });

  it('keeps an unchanged past date but rejects a new past date', () => {
    const past = { ...valid, expires_on: '2026-11-01' };
    expect(() => toTimedActionReplace(past, 'ta-abcdefgh', '2026-11-01', today)).not.toThrow();
    expect(() => toTimedActionReplace(past, 'ta-abcdefgh', '2026-11-30', today)).toThrow(
      ContentStoreError,
    );
  });
});

describe('generateTimedActionId', () => {
  it('generates ids in the expected shape', () => {
    expect(generateTimedActionId()).toMatch(/^ta-[a-z0-9]{8}$/);
  });
});

describe('malformed input is rejected with a 400, never another error', () => {
  const starterTemplate = {
    goal_id: '',
    description: '',
    link: { label: '', url: '' },
    location: { label: '', address: '' },
    expires_on: '',
  };
  const cases: [string, unknown][] = [
    ['empty link url', { ...valid, link: { label: 'x', url: '' } }],
    ['unparseable link url', { ...valid, link: { label: 'x', url: 'not a url' } }],
    ['unfilled starter template', starterTemplate],
    ['non-object body', 'text'],
    ['null body', null],
    ['non-string date', { ...valid, expires_on: 20261130 }],
  ];

  it.each(cases)('create: %s', (_name, input) => {
    expect.assertions(2);
    try {
      toTimedActionCreate(input, today);
    } catch (err) {
      expect(err).toBeInstanceOf(ContentStoreError);
      expect((err as ContentStoreError).status).toBe(400);
    }
  });

  it.each(cases)('replace: %s', (_name, input) => {
    expect.assertions(2);
    try {
      toTimedActionReplace(input, 'ta-abcdefgh', '2026-11-30', today);
    } catch (err) {
      expect(err).toBeInstanceOf(ContentStoreError);
      expect((err as ContentStoreError).status).toBe(400);
    }
  });
});
