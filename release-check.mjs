import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function verifyRelease({origin,healthPath,commit,version,assets=[]}){
 const health=await fetch(new URL(healthPath,origin),{signal:AbortSignal.timeout(5000)});
 if(!health.ok)throw Error('Release health check failed.');
 const body=await health.json(),actual=body.release?.commit??body.commit;
 if(body.ok!==true||actual!==commit||version&&body.version!==version)throw Error('Release identity does not match.');
 const checked=await Promise.all(assets.map(async asset=>{
  const response=await fetch(new URL(asset.path,origin),{signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw Error('Release asset is unavailable.');
  const [served,expected]=await Promise.all([response.arrayBuffer(),readFile(asset.file)]);
  if(hash(Buffer.from(served))!==hash(expected))throw Error('Release asset does not match.');
  return {path:asset.path,sha256:hash(expected)};
 }));
 return {event:'release_verification',ok:true,commit,...(version?{version}:{}),assets:checked};
}
