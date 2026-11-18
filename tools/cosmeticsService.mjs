import { readFileSync } from 'node:fs';
import { createCosmeticsServer } from '../app/lib/cosmeticsServer.mjs';

const panel = readFileSync(new URL('./cosmeticsHost.html', import.meta.url));
const server = createCosmeticsServer({ panel, origin: process.env.COSMETICS_ORIGIN });
server.listen(Number(process.env.COSMETICS_PORT ?? 8793), process.env.COSMETICS_HOST ?? '127.0.0.1',
  () => console.log(server.address().port));
