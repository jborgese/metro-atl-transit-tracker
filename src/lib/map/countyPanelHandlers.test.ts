import { describe, expect, it, vi } from 'vitest';
import { handleCountySelection } from './countyPanelHandlers';

const metroCountyGeoids = ['13121', '13089'];
const fulton = { geoid: '13121', name: 'Fulton County' };

describe('handleCountySelection', () => {
  it('selects the metadata for a metro county feature', () => {
    const setSelectedCounty = vi.fn();

    handleCountySelection({
      feature: { properties: { GEOID: '13121', NAME: 'Fulton' } },
      countyMetadataMap: { '13121': fulton },
      metroCountyGeoids,
      setSelectedCounty,
    });

    expect(setSelectedCounty).toHaveBeenCalledWith(fulton);
  });

  it('falls back to the feature name when the county has no metadata', () => {
    const setSelectedCounty = vi.fn();

    handleCountySelection({
      feature: { properties: { GEOID: '13089', NAME: 'DeKalb' } },
      countyMetadataMap: {},
      metroCountyGeoids,
      setSelectedCounty,
    });

    expect(setSelectedCounty).toHaveBeenCalledWith({ geoid: '13089', name: 'DeKalb' });
  });

  it('ignores a county outside the metro area, or no feature at all', () => {
    const setSelectedCounty = vi.fn();

    handleCountySelection({
      feature: { properties: { GEOID: '13001' } },
      countyMetadataMap: {},
      metroCountyGeoids,
      setSelectedCounty,
    });
    handleCountySelection({
      feature: undefined,
      countyMetadataMap: {},
      metroCountyGeoids,
      setSelectedCounty,
    });

    expect(setSelectedCounty).not.toHaveBeenCalled();
  });
});
