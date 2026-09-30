import { app } from './app.js';
import { migrate } from './migrate.js';
import { seed } from './seed.js';
import { startEmailNotificationWorker } from './emailNotifications.js';

await migrate();
await seed();
app.listen(4000, () => console.log('API listening on :4000'));
startEmailNotificationWorker();
