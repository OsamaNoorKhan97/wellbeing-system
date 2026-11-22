import { createApp } from './app';
import { env } from './config/env';
import { closePool } from './db/pool';
import { processDueReminders } from './modules/meetings/meetings.service';

const server = createApp().listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}/api/v1 (${env.NODE_ENV})`);
});

// Snoozed meeting reminders are also created in the background, so they exist even before the manager's next page load.
const reminderTimer = setInterval(() => {
  processDueReminders().catch((error) => console.error('Reminder job failed:', error.message));
}, 60_000);
reminderTimer.unref();

function shutdown() {
  clearInterval(reminderTimer);
  server.close(() => {
    closePool().finally(() => process.exit(0));
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
