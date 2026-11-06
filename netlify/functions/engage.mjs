import { getStore } from '@netlify/blobs';
import { handle } from './engage-core.mjs';
export default (req) => handle(req, getStore({ name: 'engage', consistency: 'strong' }), process.env.ADMIN_KEY);
