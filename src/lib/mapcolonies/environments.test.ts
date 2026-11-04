import { describe, expect, it } from 'vitest';
import { MC_ENVIRONMENTS, mcEnvStore, tokenFor } from './environments';

describe('MapColonies environments', () => {
  it('lists prod / int / dev catalogue endpoints', () => {
    expect(MC_ENVIRONMENTS.map(e => [e.id, e.cswUrl])).toEqual([
      ['prod', 'https://catalog.mapcolonies.net/api/3d/v1/csw'],
      ['int', 'https://catalog-int.mapcolonies.net/api/3d/v1/csw'],
      ['dev', 'https://catalog-dev.mapcolonies.net/api/3d/v1/csw'],
    ]);
  });
  it('switches, remembers the choice in this browser and notifies listeners', () => {
    let calls = 0;
    const off = mcEnvStore.subscribe(() => calls++);
    mcEnvStore.set('int');
    expect(mcEnvStore.get()).toBe('int');
    expect(mcEnvStore.environment().cswUrl).toContain('catalog-int');
    expect(localStorage.getItem('cea-mapcolonies-env')).toBe('int');
    mcEnvStore.set('int');
    expect(calls).toBe(1);
    mcEnvStore.set('prod'); off();
  });
  it('falls back to the shared token when an environment has none of its own', () => {
    expect(tokenFor('dev')).toBe(tokenFor('prod'));
  });
});
