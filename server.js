import 'dotenv/config';
import {restorePersistentSnapshot} from './persistence.js';

await restorePersistentSnapshot();
await import('./server-patch.js');
await import('./google-oauth-patch.js');
await import('./password-channel-patch.js');
await import('./retail-mail-patch.js');
await import('./phone-password-login-patch.js');
await import('./index.js');
