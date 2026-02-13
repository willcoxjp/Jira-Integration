import { describe, it, expect } from 'vitest';
import { escapeCsvField, generateCsv } from '../src/utils/csv';

describe('escapeCsvField', () => {
  it('returns empty string for null/undefined', () => {
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
  });

  it('converts numbers to strings', () => {
    expect(escapeCsvField(42)).toBe('42');
    expect(escapeCsvField(4.567)).toBe('4.567');
  });

  it('passes through simple strings unquoted', () => {
    expect(escapeCsvField('hello')).toBe('hello');
  });

  it('wraps strings with commas in quotes', () => {
    expect(escapeCsvField('hello, world')).toBe('"hello, world"');
  });

  it('wraps strings with newlines in quotes', () => {
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
  });

  it('escapes double quotes by doubling them', () => {
    expect(escapeCsvField('say "hello"')).toBe('"say ""hello"""');
  });

  it('handles strings with both commas and quotes', () => {
    expect(escapeCsvField('value "A", value "B"')).toBe('"value ""A"", value ""B"""');
  });
});

describe('generateCsv', () => {
  it('generates header row from columns', () => {
    const csv = generateCsv(['Name', 'Value'], []);
    expect(csv).toBe('Name,Value');
  });

  it('generates rows matching column order', () => {
    const csv = generateCsv(
      ['OrderNumber', 'PartNumber', 'Quantity'],
      [
        { OrderNumber: 'IF-100', PartNumber: 'Defect', Quantity: 8 },
        { OrderNumber: 'IF-200', PartNumber: 'Feature', Quantity: 24 },
      ]
    );
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('OrderNumber,PartNumber,Quantity');
    expect(lines[1]).toBe('IF-100,Defect,8');
    expect(lines[2]).toBe('IF-200,Feature,24');
  });

  it('handles missing fields as empty strings', () => {
    const csv = generateCsv(
      ['A', 'B', 'C'],
      [{ A: 'x', C: 'z' }]
    );
    const lines = csv.split('\n');
    expect(lines[1]).toBe('x,,z');
  });

  it('escapes fields that contain commas', () => {
    const csv = generateCsv(
      ['Name', 'Notes'],
      [{ Name: 'Test', Notes: 'fix bug, refactor' }]
    );
    const lines = csv.split('\n');
    expect(lines[1]).toBe('Test,"fix bug, refactor"');
  });
});
