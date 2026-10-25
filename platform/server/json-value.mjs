import {isDeepStrictEqual} from 'node:util';

// JSONB does not retain object field order. Compare the stored JSON values.
// Array order and every persisted field value still have to match.
export function sameJson(a,b){
 return isDeepStrictEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)));
}
