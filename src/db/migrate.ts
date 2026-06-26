import { closeDatabase, runMigrationsIfPresent } from "./client";

runMigrationsIfPresent();
closeDatabase();
