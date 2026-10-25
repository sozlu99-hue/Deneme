import {AsyncLocalStorage} from 'node:async_hooks';

export const controlScope=new AsyncLocalStorage();
export function requireActiveWrite(){
 if(controlScope.getStore()?.active===false)throw Object.assign(Error('The write request has ended.'),{status:503});
}
