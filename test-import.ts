// Test importing the built library
import { ZustandSurrealSyncEngine, SurrealDBAdapter, FieldBuilder } from './dist/index.js';

console.log('✅ Successfully imported ZustandSurrealSyncEngine:', typeof ZustandSurrealSyncEngine);
console.log('✅ Successfully imported SurrealDBAdapter:', typeof SurrealDBAdapter);
console.log('✅ Successfully imported FieldBuilder:', typeof FieldBuilder);

// Test creating instances
const config = {
  dbName: 'test-db',
  namespace: 'test',
  database: 'test',
  tables: {}
};

const syncEngine = new ZustandSurrealSyncEngine(config);
console.log('✅ Successfully created sync engine instance');

const adapter = new SurrealDBAdapter(config);
console.log('✅ Successfully created adapter instance');

// Test FieldBuilder
const stringField = FieldBuilder.string({ required: true });
console.log('✅ Successfully created field definition:', stringField);

console.log('🎉 All imports and basic functionality working!');