// County metadata structure
export interface CountyMetadata {
	geoid: string;
	name: string;
	[key: string]: any; // For additional properties
}

// Project metadata structure
export interface ProjectMetadata {
	id: string;
	name: string;
	modes?: string[];
	related_counties?: string[];
	[key: string]: any; // For additional properties
}

// Lookup map for counties
export type CountyMetadataMap = Record<string, CountyMetadata>;
// Re-export centralized map types
export * from '../../types/map'
