// Use the existing account phone. This does not register or verify a new number.
export function normalizeLoginPhone(value){
 if(typeof value!=='string'||value.length>40||!/^\+?[0-9 ()-]+$/.test(value.trim()))return'';
 let raw=value.trim().replace(/[ ()-]/g,'');
 if(raw.startsWith('00'))raw='+'+raw.slice(2);
 if(/^5\d{9}$/.test(raw))return'+90'+raw;
 if(/^05\d{9}$/.test(raw))return'+90'+raw.slice(1);
 if(/^90\d{10}$/.test(raw))return'+'+raw;
 return /^\+[1-9]\d{9,14}$/.test(raw)?raw:'';
}
