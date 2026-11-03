import type { PageServerLoad } from './$types';
import { listPasskeys } from '#lib/server/auth/webauthn.ts';

export const load: PageServerLoad = async () => ({ passkeys: listPasskeys() });
