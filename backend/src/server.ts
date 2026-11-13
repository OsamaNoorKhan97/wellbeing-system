import { createApp } from './app';
import { env } from './config/env';
import { closePool } from './db/pool';

const server = createApp().listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}/api/v1 (${env.NODE_ENV})`);
});

function shutdown() {
  server.close(() => {
    closePool().finally(() => process.exit(0));
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
