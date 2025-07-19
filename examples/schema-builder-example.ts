import { 
  FieldBuilder, 
  IndexBuilder, 
  createSchema, 
  SchemaUtils,
  createMigrationManager
} from '../src/schema';

// Example 1: Building a User schema with the FieldBuilder
console.log('=== Example 1: Building User Schema ===');

const userSchema = createSchema('users')
  .addField('id', FieldBuilder.uuid({ required: true }))
  .addField('email', FieldBuilder.email())
  .addField('username', FieldBuilder.slug({ required: true, unique: true }))
  .addField('firstName', FieldBuilder.string({ required: true, minLength: 2, maxLength: 50 }))
  .addField('lastName', FieldBuilder.string({ required: true, minLength: 2, maxLength: 50 }))
  .addField('age', FieldBuilder.integer({ min: 13, max: 120 }))
  .addField('isActive', FieldBuilder.boolean())
  .addField('profilePicture', FieldBuilder.url())
  .addField('phoneNumber', FieldBuilder.phoneNumber())
  .addField('bio', FieldBuilder.string({ maxLength: 500 }))
  .addField('tags', FieldBuilder.array('string', { maxLength: 10 }))
  .addField('settings', FieldBuilder.json())
  .addAuditFields() // Adds createdAt, updatedAt, version
  .addSoftDelete() // Adds deletedAt field and index
  .addIndex(IndexBuilder.unique('email_unique', ['email']))
  .addIndex(IndexBuilder.unique('username_unique', ['username']))
  .addIndex(IndexBuilder.composite('name_search', ['firstName', 'lastName']))
  .addIndex(IndexBuilder.fulltext('bio_search', ['bio']))
  .addSuggestedIndexes() // Automatically suggests optimal indexes
  .build();

console.log('User Schema:', JSON.stringify(userSchema, null, 2));

// Example 2: Building a Blog Post schema with relationships
console.log('\n=== Example 2: Building Blog Post Schema ===');

const postSchema = createSchema('posts')
  .addField('id', FieldBuilder.uuid({ required: true }))
  .addField('title', FieldBuilder.string({ required: true, minLength: 5, maxLength: 200 }))
  .addField('slug', FieldBuilder.slug({ required: true, unique: true }))
  .addField('content', FieldBuilder.string({ required: true, minLength: 100 }))
  .addField('excerpt', FieldBuilder.string({ maxLength: 300 }))
  .addField('authorId', FieldBuilder.record('users', { required: true }))
  .addField('categoryId', FieldBuilder.record('categories'))
  .addField('tags', FieldBuilder.set('string', { maxLength: 20 }))
  .addField('status', FieldBuilder.string({ 
    required: true, 
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  }))
  .addField('publishedAt', FieldBuilder.datetime())
  .addField('viewCount', FieldBuilder.integer({ min: 0, default: 0 }))
  .addField('rating', FieldBuilder.rating(5))
  .addField('featured', FieldBuilder.boolean())
  .addField('metadata', FieldBuilder.object({
    default: {
      readingTime: 0,
      wordCount: 0,
      difficulty: 'beginner'
    }
  }))
  .addAuditFields()
  .addMultiTenant() // Adds tenantId field and indexes for multi-tenancy
  .addIndex(IndexBuilder.composite('author_status', ['authorId', 'status']))
  .addIndex(IndexBuilder.composite('published_posts', ['status', 'publishedAt']))
  .addIndex(IndexBuilder.fulltext('content_search', ['title', 'content', 'excerpt']))
  .build();

console.log('Post Schema:', JSON.stringify(postSchema, null, 2));

// Example 3: E-commerce Product schema with advanced field types
console.log('\n=== Example 3: Building E-commerce Product Schema ===');

const productSchema = createSchema('products')
  .addField('id', FieldBuilder.uuid({ required: true }))
  .addField('sku', FieldBuilder.string({ 
    required: true, 
    unique: true, 
    pattern: '^[A-Z0-9]{3,}-[A-Z0-9]{3,}$',
    uppercase: true
  }))
  .addField('name', FieldBuilder.string({ required: true, minLength: 3, maxLength: 100 }))
  .addField('description', FieldBuilder.string({ maxLength: 2000 }))
  .addField('price', FieldBuilder.currency({ required: true, min: 0 }))
  .addField('compareAtPrice', FieldBuilder.currency({ min: 0 }))
  .addField('costPrice', FieldBuilder.currency({ min: 0 }))
  .addField('weight', FieldBuilder.decimal({ min: 0 }))
  .addField('dimensions', FieldBuilder.object({
    default: { length: 0, width: 0, height: 0, unit: 'cm' }
  }))
  .addField('inventory', FieldBuilder.integer({ min: 0, default: 0 }))
  .addField('lowStockThreshold', FieldBuilder.integer({ min: 0, default: 10 }))
  .addField('categoryId', FieldBuilder.record('categories', { required: true }))
  .addField('brandId', FieldBuilder.record('brands'))
  .addField('supplierId', FieldBuilder.record('suppliers'))
  .addField('images', FieldBuilder.array('string', { maxLength: 10 }))
  .addField('tags', FieldBuilder.set('string', { maxLength: 50 }))
  .addField('status', FieldBuilder.string({ 
    required: true,
    enum: ['active', 'inactive', 'discontinued'],
    default: 'active'
  }))
  .addField('isDigital', FieldBuilder.boolean())
  .addField('requiresShipping', FieldBuilder.boolean())
  .addField('taxable', FieldBuilder.boolean())
  .addField('seoTitle', FieldBuilder.string({ maxLength: 60 }))
  .addField('seoDescription', FieldBuilder.string({ maxLength: 160 }))
  .addField('variants', FieldBuilder.array('object', { default: [] }))
  .addAuditFields()
  .addSoftDelete()
  .addIndex(IndexBuilder.unique('sku_unique', ['sku']))
  .addIndex(IndexBuilder.composite('category_status', ['categoryId', 'status']))
  .addIndex(IndexBuilder.composite('price_range', ['price', 'status']))
  .addIndex(IndexBuilder.fulltext('product_search', ['name', 'description', 'tags']))
  .addIndex(IndexBuilder.single('inventory'))
  .build();

console.log('Product Schema:', JSON.stringify(productSchema, null, 2));

// Example 4: Schema validation and migration
console.log('\n=== Example 4: Schema Validation and Migration ===');

// Validate the schemas
const userValidation = SchemaUtils.validate(userSchema, { strict: true, checkIndexes: true });
console.log('User Schema Validation:', {
  valid: userValidation.valid,
  errors: userValidation.errors,
  warnings: userValidation.warnings,
  suggestions: userValidation.suggestions
});

// Create a legacy schema and migrate it
const legacyUserSchema = {
  id: 'varchar',
  email: 'text',
  name: 'varchar',
  age: 'integer',
  created_at: 'timestamp'
};

const migratedSchema = SchemaUtils.migrate(legacyUserSchema, { addMissingIndexes: true });
console.log('Migrated Legacy Schema:', JSON.stringify(migratedSchema, null, 2));

// Compare schemas to detect differences
const oldUserSchema = {
  fields: {
    id: FieldBuilder.string(),
    email: FieldBuilder.email(),
    name: FieldBuilder.string()
  }
};

const newUserSchema = {
  fields: {
    id: FieldBuilder.uuid({ required: true }),
    email: FieldBuilder.email(),
    name: FieldBuilder.string(),
    age: FieldBuilder.integer({ min: 0 })
  }
};

const comparison = SchemaUtils.compare(oldUserSchema, newUserSchema);
console.log('Schema Comparison:', {
  identical: comparison.identical,
  migrationRequired: comparison.migrationRequired,
  breakingChanges: comparison.breakingChanges,
  differences: comparison.differences.map(diff => ({
    type: diff.type,
    path: diff.path,
    breaking: diff.breaking,
    description: diff.description
  }))
});

// Generate migration script
const migrationScript = SchemaUtils.generateMigration('users', oldUserSchema, newUserSchema);
console.log('Migration Script:', migrationScript);

// Example 5: Advanced migration management
console.log('\n=== Example 5: Advanced Migration Management ===');

const migrationManager = createMigrationManager();

// Add schema versions
migrationManager.addVersion({
  version: '1.0.0',
  timestamp: Date.now() - 86400000, // 1 day ago
  description: 'Initial user schema',
  schema: oldUserSchema,
  migrations: []
});

migrationManager.addVersion({
  version: '2.0.0',
  timestamp: Date.now(),
  description: 'Enhanced user schema with age field',
  schema: newUserSchema,
  migrations: []
});

// Create migration plan
const migrationPlan = migrationManager.createMigrationPlan('1.0.0', '2.0.0', 'users');
console.log('Migration Plan:', {
  version: migrationPlan.version,
  totalSteps: migrationPlan.totalSteps,
  breakingChanges: migrationPlan.breakingChanges,
  estimatedTime: migrationPlan.estimatedTime,
  steps: migrationPlan.steps.map(step => ({
    id: step.id,
    description: step.description,
    breaking: step.breaking,
    upStatements: step.up.length,
    downStatements: step.down.length
  }))
});

// Validate migration plan
const planValidation = migrationManager.validateMigrationPlan(migrationPlan);
console.log('Migration Plan Validation:', planValidation);

// Example 6: Generate SurrealDB statements
console.log('\n=== Example 6: Generate SurrealDB Statements ===');

const userSchemaBuilder = createSchema('users')
  .addField('id', FieldBuilder.uuid({ required: true }))
  .addField('email', FieldBuilder.email())
  .addField('name', FieldBuilder.string({ required: true, minLength: 2 }))
  .addIndex(IndexBuilder.primary())
  .addIndex(IndexBuilder.unique('email_unique', ['email']));

const surrealStatements = userSchemaBuilder.generateSurrealDBStatements();
console.log('SurrealDB Schema Statements:');
surrealStatements.forEach(statement => console.log(statement));

console.log('\n=== Schema Builder Examples Complete ===');