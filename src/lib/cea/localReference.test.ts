import {describe,it,expect} from 'vitest';
import {validateReference,MAX_REFERENCE_BYTES,readLocalReference} from './localReference';
describe('local reference geometry',()=>{
 it('accepts WGS84 polygons without changing their geometry',()=>{const data={type:'FeatureCollection' as const,features:[{type:'Feature' as const,properties:{},geometry:{type:'Polygon' as const,coordinates:[[[35,32],[35.1,32],[35.1,32.1],[35,32]]]}}]};expect(validateReference(data)).toBe(data);});
 it('rejects projected coordinates without conversion',()=>expect(()=>validateReference({type:'FeatureCollection',features:[{type:'Feature',properties:{},geometry:{type:'Point',coordinates:[500000,3500000]}}]})).toThrow());
 it('rejects shapefiles over the 20 MB limit',async()=>{expect(MAX_REFERENCE_BYTES).toBe(20971520);await expect(readLocalReference([{size:20971521} as File])).rejects.toThrow();});
});