import { describe, expect, it } from 'vitest';
import { activeFilterCount, filtersToSearch, parseFilters } from './filters';

describe('URL filter state', () => {
  it('parses list and scalar params and drops unknown enum values', () => {
    const f = parseFilters(new URLSearchParams('q=java&workMode=WFH,MOON&skills=java,sql&experience=freshers&status=expired'));
    expect(f.q).toBe('java');
    expect(f.workMode).toEqual(['WFH']);
    expect(f.skills).toEqual(['java', 'sql']);
    expect(f.experience).toBe('freshers');
    expect(activeFilterCount(f)).toBe(5);
  });

  it('round-trips through the query string, omitting empty values', () => {
    const f = parseFilters(new URLSearchParams('category=testing-qa&location=Pune'));
    expect(filtersToSearch(f)).toBe('?category=testing-qa&location=Pune');
    expect(filtersToSearch(parseFilters(new URLSearchParams('')))).toBe('');
  });
});
