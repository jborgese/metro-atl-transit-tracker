export async function loadCountyMetadata(url = '/data/geo/counties-metadata.json') {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`metadata fetch ${res.status}`);
    const countyMetadata = await res.json();
    const countyMetadataMap: Record<string, any> = {};
    for (const c of countyMetadata) {
      if (c.geoid) countyMetadataMap[String(c.geoid)] = c;
    }
    return { countyMetadata, countyMetadataMap };
  } catch (e) {
    return { countyMetadata: [], countyMetadataMap: {}, error: e };
  }
}
export async function loadProjectsMetadata(url = '/api/projects') {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`projects fetch ${res.status}`);
    const payload = await res.json();
    const projectsMetadata = Array.isArray(payload) ? payload : payload?.data ?? [];
    return { projectsMetadata };
  } catch (e) {
    return { projectsMetadata: [], error: e };
  }
}
