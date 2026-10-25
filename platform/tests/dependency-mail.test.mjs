import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(new URL('../../package.json',import.meta.url));
const nodemailer=await import(pathToFileURL(require.resolve('nodemailer')).href.replace('/dist/cjs/','/dist/esm/'));
assert.equal(typeof nodemailer.createTransport,'function');

test('The updated mail library builds a Turkish reset message without network delivery',async()=>{
 const transport=nodemailer.createTransport({streamTransport:true,buffer:true,disableFileAccess:true,disableUrlAccess:true});
 const result=await transport.sendMail({from:'AESD <sender@example.test>',to:'recipient@example.test',subject:'AESD şifre yenileme kodu',text:'Yalıtılmış test: Kod 123456. Bu bir gerçek teslim testi değildir.'});
 assert.ok(Buffer.isBuffer(result.message));assert.deepEqual(result.envelope.to,['recipient@example.test']);
 assert.match(result.message.toString(),/To: recipient@example.test/);assert.match(result.message.toString(),/123456/);
});
test('The mail transport rejects a file attachment when file access is disabled',async()=>{
 const transport=nodemailer.createTransport({streamTransport:true,buffer:true,disableFileAccess:true,disableUrlAccess:true});
 await assert.rejects(transport.sendMail({from:'sender@example.test',to:'recipient@example.test',text:'Test',attachments:[{path:'/tmp/aesd-file-access-must-not-be-read'}]}),/File access rejected/);
});
