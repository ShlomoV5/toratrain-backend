const { createApp } = require('./createApp');
const db = require('./db');
const { port } = require('./config');

const app = createApp(db);

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
