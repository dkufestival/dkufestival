const sequelize = require('../src/config/db');
const { runMigrations, rollbackLastMigration } = require('../src/migrations/runner');

async function main() {
  await sequelize.authenticate();
  if (process.argv.includes('--down')) {
    await rollbackLastMigration();
  } else {
    await runMigrations();
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
