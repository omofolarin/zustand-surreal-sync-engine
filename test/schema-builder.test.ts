import { describe, it, expect, beforeEach } from 'vitest';
import { 
  FieldBuilder, 
  IndexBuilder, 
  SchemaUtils, 
  createSchema, 
  createMigrationManager,
  SchemaMigrationManager,
  SchemaBuilder
} from '../src/schema';
import type { TableSchema, FieldDefinition, IndexDefinition } from '../src/types';

describe('FieldBuilder', () => {
  describe('string fields', () => {
    it('should create basic string field', () => {
      const field = FieldBuilder.string();
      expect(field).toEqual({
        type: 'string',
        constraints: { nullable: true }
      });
    });

    it('should create required string field', () => {
      const field = FieldBuilder.string({ required: true });
      expect(field.constraints?.nullable).toBe(false);
    });

    it('should create string field with length constraints', () => {
      const field = FieldBuilder.string({ minLength: 5, maxLength: 100 });
      expect(field.constraints?.assert).toContain('string::len($value) >= 5');
      expect(field.constraints?.assert).toContain('string::len($value) <= 100');
    });

    it('should create string field with enum values', () => {
      const field = FieldBuilder.string({ enum: ['active', 'inactive', 'pending'] });
      expect(field.constraints?.assert).toContain('$value INSIDE ["active", "inactive", "pending"]');
    });

    it('should create string field with pattern validation', () => {
      const field = FieldBuilder.string({ pattern: '^[a-zA-Z]+$' });
      expect(field.constraints?.assert).toContain('string::matches($value, "^[a-zA-Z]+$")');
    });

    it('should create string field with text transformations', () => {
      const field = FieldBuilder.string({ lowercase: true, trim: true });
      expect(field.constraints?.value).toContain('string::lowercase');
      expect(field.constraints?.value).toContain('string::trim');
    });
  });

  describe('number fields', () => {
    it('should create integer field', () => {
      const field = FieldBuilder.integer();
      expect(field.type).toBe('int');
    });

    it('should create decimal field', () => {
      const field = FieldBuilder.decimal();
      expect(field.type).toBe('decimal');
    });

    it('should create float field', () => {
      const field = FieldBuilder.float();
      expect(field.type).toBe('float');
    });

    it('should create number field with range constraints', () => {
      const field = FieldBuilder.number({ min: 0, max: 100 });
      expect(field.constraints?.assert).toContain('$value >= 0');
      expect(field.constraints?.assert).toContain('$value <= 100');
    });

    it('should create positive number field', () => {
      const field = FieldBuilder.number({ positive: true });
      expect(field.constraints?.assert).toContain('$value > 0');
    });

    it('should create number field with multipleOf constraint', () => {
      const field = FieldBuilder.number({ multipleOf: 5 });
      expect(field.constraints?.assert).toContain('$value % 5 = 0');
    });
  });

  describe('datetime fields', () => {
    it('should create datetime field with autoNow', () => {
      const field = FieldBuilder.datetime({ autoNow: true });
      expect(field.constraints?.value).toBe('time::now()');
    });

    it('should create datetime field with autoNowAdd', () => {
      const field = FieldBuilder.datetime({ autoNowAdd: true });
      expect(field.constraints?.default).toBe('time::now()');
    });

    it('should create datetime field with date range', () => {
      const minDate = new Date('2023-01-01');
      const maxDate = new Date('2023-12-31');
      const field = FieldBuilder.datetime({ minDate, maxDate });
      expect(field.constraints?.assert).toContain('$value >= d"2023-01-01T00:00:00.000Z"');
      expect(field.constraints?.assert).toContain('$value <= d"2023-12-31T00:00:00.000Z"');
    });
  });

  describe('array fields', () => {
    it('should create array field', () => {
      const field = FieldBuilder.array('string');
      expect(field.type).toBe('array<string>');
      expect(field.constraints?.default).toEqual([]);
    });

    it('should create array field with length constraints', () => {
      const field = FieldBuilder.array('string', { minLength: 1, maxLength: 10 });
      expect(field.constraints?.assert).toContain('array::len($value) >= 1');
      expect(field.constraints?.assert).toContain('array::len($value) <= 10');
    });

    it('should create set field with unique constraint', () => {
      const field = FieldBuilder.set('string');
      expect(field.type).toBe('set<string>');
      expect(field.constraints?.assert).toContain('array::len($value) = array::len(array::distinct($value))');
    });
  });

  describe('record fields', () => {
    it('should create record field', () => {
      const field = FieldBuilder.record('users');
      expect(field.type).toBe('record<users>');
      expect(field.constraints?.nullable).toBe(false);
      expect(field.constraints?.assert).toBe('$value != NONE');
    });

    it('should create optional record field', () => {
      const field = FieldBuilder.record('users', { required: false });
      expect(field.constraints?.nullable).toBe(true);
    });
  });

  describe('specialized fields', () => {
    it('should create email field', () => {
      const field = FieldBuilder.email();
      expect(field.constraints?.assert).toBe('string::is::email($value)');
      expect(field.constraints?.unique).toBe(true);
    });

    it('should create UUID field', () => {
      const field = FieldBuilder.uuid();
      expect(field.type).toBe('uuid');
      expect(field.constraints?.assert).toBe('string::is::uuid($value)');
    });

    it('should create URL field', () => {
      const field = FieldBuilder.url();
      expect(field.constraints?.assert).toBe('string::is::url($value)');
    });

    it('should create slug field', () => {
      const field = FieldBuilder.slug();
      expect(field.constraints?.assert).toContain('^[a-z0-9]+(?:-[a-z0-9]+)*$');
      expect(field.constraints?.value).toContain('lowercase');
    });

    it('should create phone number field', () => {
      const field = FieldBuilder.phoneNumber();
      expect(field.constraints?.assert).toContain('^\\+?[1-9]\\d{1,14}$');
    });

    it('should create currency field', () => {
      const field = FieldBuilder.currency({ min: 0, max: 1000000 });
      expect(field.type).toBe('decimal');
      expect(field.constraints?.assert).toContain('$value >= 0');
      expect(field.constraints?.assert).toContain('$value <= 1000000');
      expect(field.constraints?.assert).toContain('math::round($value * 100) / 100');
    });

    it('should create percentage field', () => {
      const field = FieldBuilder.percentage();
      expect(field.type).toBe('decimal');
      expect(field.constraints?.assert).toContain('$value >= 0');
      expect(field.constraints?.assert).toContain('$value <= 100');
    });

    it('should create rating field', () => {
      const field = FieldBuilder.rating(5);
      expect(field.type).toBe('int');
      expect(field.constraints?.assert).toContain('$value >= 1');
      expect(field.constraints?.assert).toContain('$value <= 5');
    });
  });

  describe('convenience methods', () => {
    it('should create ID field', () => {
      const field = FieldBuilder.id();
      expect(field.type).toBe('uuid');
      expect(field.constraints?.nullable).toBe(false);
    });

    it('should create createdAt field', () => {
      const field = FieldBuilder.createdAt();
      expect(field.type).toBe('datetime');
      expect(field.constraints?.default).toBe('time::now()');
    });

    it('should create updatedAt field', () => {
      const field = FieldBuilder.updatedAt();
      expect(field.type).toBe('datetime');
      expect(field.constraints?.value).toBe('time::now()');
    });

    it('should create version field', () => {
      const field = FieldBuilder.version();
      expect(field.type).toBe('int');
      expect(field.constraints?.default).toBe(1);
      expect(field.constraints?.assert).toContain('$value >= 1');
    });
  });
});

describe('IndexBuilder', () => {
  it('should create unique index', () => {
    const index = IndexBuilder.unique('email_unique', ['email']);
    expect(index).toEqual({
      name: 'email_unique',
      fields: ['email'],
      unique: true,
      type: 'btree'
    });
  });

  it('should create composite index', () => {
    const index = IndexBuilder.composite('user_status', ['userId', 'status']);
    expect(index).toEqual({
      name: 'user_status',
      fields: ['userId', 'status'],
      unique: false,
      type: 'btree'
    });
  });

  it('should create fulltext index', () => {
    const index = IndexBuilder.fulltext('content_search', ['title', 'content']);
    expect(index).toEqual({
      name: 'content_search',
      fields: ['title', 'content'],
      type: 'fulltext',
      unique: false
    });
  });

  it('should create hash index', () => {
    const index = IndexBuilder.hash('status_hash', ['status']);
    expect(index).toEqual({
      name: 'status_hash',
      fields: ['status'],
      unique: false,
      type: 'hash'
    });
  });

  it('should create single field index', () => {
    const index = IndexBuilder.single('createdAt');
    expect(index).toEqual({
      name: 'idx_createdAt',
      fields: ['createdAt'],
      unique: false,
      type: 'btree'
    });
  });

  it('should create primary key index', () => {
    const index = IndexBuilder.primary();
    expect(index).toEqual({
      name: 'primary',
      fields: ['id'],
      unique: true,
      type: 'btree'
    });
  });

  it('should create foreign key index', () => {
    const index = IndexBuilder.foreignKey('userId', 'users');
    expect(index).toEqual({
      name: 'fk_userId_users',
      fields: ['userId'],
      unique: false,
      type: 'btree'
    });
  });

  describe('common index patterns', () => {
    it('should create audit indexes', () => {
      const indexes = IndexBuilder.common.audit();
      expect(indexes).toHaveLength(3);
      expect(indexes.map(idx => idx.fields[0])).toEqual(['createdAt', 'updatedAt', 'version']);
    });

    it('should create user indexes', () => {
      const indexes = IndexBuilder.common.user();
      expect(indexes).toHaveLength(3);
      expect(indexes[0].unique).toBe(true);
      expect(indexes[0].fields).toEqual(['email']);
    });

    it('should create hierarchy indexes', () => {
      const indexes = IndexBuilder.common.hierarchy('parentId');
      expect(indexes).toHaveLength(2);
      expect(indexes[1].fields).toEqual(['parentId', 'id']);
    });
  });

  describe('index suggestions', () => {
    it('should suggest indexes for schema', () => {
      const schema = {
        id: FieldBuilder.uuid({ unique: true }),
        email: FieldBuilder.email(),
        name: FieldBuilder.string(),
        userId: FieldBuilder.record('users'),
        status: FieldBuilder.string({ enum: ['active', 'inactive'] })
      };

      const suggestions = IndexBuilder.suggest(schema);
      expect(suggestions.length).toBeGreaterThan(0);
      
      // Should suggest unique index for unique fields
      const uniqueIndexes = suggestions.filter(idx => idx.unique);
      expect(uniqueIndexes.length).toBeGreaterThan(0);
      
      // Should suggest foreign key index
      const fkIndexes = suggestions.filter(idx => idx.name.includes('fk_'));
      expect(fkIndexes.length).toBeGreaterThan(0);
      
      // Should suggest fulltext index for name field
      const fulltextIndexes = suggestions.filter(idx => idx.type === 'fulltext');
      expect(fulltextIndexes.length).toBeGreaterThan(0);
    });
  });

  describe('index validation', () => {
    it('should validate valid index', () => {
      const schema = { name: FieldBuilder.string(), email: FieldBuilder.email() };
      const index = IndexBuilder.unique('email_unique', ['email']);
      
      const validation = IndexBuilder.validate(index, schema);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect invalid index', () => {
      const schema = { name: FieldBuilder.string() };
      const index = IndexBuilder.unique('email_unique', ['email']); // email field doesn't exist
      
      const validation = IndexBuilder.validate(index, schema);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain("Index 'email_unique' references non-existent field 'email'");
    });

    it('should validate fulltext index on non-string field', () => {
      const schema = { count: FieldBuilder.integer() };
      const index = IndexBuilder.fulltext('count_search', ['count']);
      
      const validation = IndexBuilder.validate(index, schema);
      expect(validation.valid).toBe(false);
      expect(validation.errors[0]).toContain('Full-text index');
    });
  });
});

describe('SchemaUtils', () => {
  describe('schema validation', () => {
    it('should validate valid schema', () => {
      const schema: TableSchema = {
        fields: {
          id: FieldBuilder.uuid({ required: true }),
          name: FieldBuilder.string({ required: true }),
          email: FieldBuilder.email()
        },
        indexes: [
          IndexBuilder.primary(),
          IndexBuilder.unique('email_unique', ['email'])
        ]
      };

      const validation = SchemaUtils.validate(schema);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect schema without fields', () => {
      const schema: TableSchema = { fields: {} };
      
      const validation = SchemaUtils.validate(schema);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Schema must have at least one field defined');
    });

    it('should detect invalid field names', () => {
      const schema: TableSchema = {
        fields: {
          'invalid-field-name': FieldBuilder.string(),
          '123invalid': FieldBuilder.string()
        }
      };

      const validation = SchemaUtils.validate(schema, { strict: true });
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(err => err.includes('invalid characters'))).toBe(true);
    });

    it('should warn about reserved field names', () => {
      const schema: TableSchema = {
        fields: {
          id: FieldBuilder.string(),
          type: FieldBuilder.string()
        }
      };

      const validation = SchemaUtils.validate(schema);
      expect(validation.warnings.some(warn => warn.includes('reserved keyword'))).toBe(true);
    });

    it('should detect conflicting constraints', () => {
      const schema: TableSchema = {
        fields: {
          name: {
            type: 'string',
            constraints: {
              nullable: false,
              default: null
            }
          }
        }
      };

      const validation = SchemaUtils.validate(schema);
      expect(validation.valid).toBe(false);
      expect(validation.errors.some(err => err.includes('non-nullable but has null default'))).toBe(true);
    });
  });

  describe('schema comparison', () => {
    it('should detect identical schemas', () => {
      const schema1: TableSchema = {
        fields: { name: FieldBuilder.string() }
      };
      const schema2: TableSchema = {
        fields: { name: FieldBuilder.string() }
      };

      const comparison = SchemaUtils.compare(schema1, schema2);
      expect(comparison.identical).toBe(true);
      expect(comparison.differences).toHaveLength(0);
    });

    it('should detect field additions', () => {
      const oldSchema: TableSchema = {
        fields: { name: FieldBuilder.string() }
      };
      const newSchema: TableSchema = {
        fields: { 
          name: FieldBuilder.string(),
          email: FieldBuilder.email()
        }
      };

      const comparison = SchemaUtils.compare(oldSchema, newSchema);
      expect(comparison.identical).toBe(false);
      expect(comparison.differences).toHaveLength(1);
      expect(comparison.differences[0].type).toBe('field_added');
      expect(comparison.differences[0].path).toBe('fields.email');
    });

    it('should detect breaking changes', () => {
      const oldSchema: TableSchema = {
        fields: { name: FieldBuilder.string({ required: false }) }
      };
      const newSchema: TableSchema = {
        fields: { name: FieldBuilder.string({ required: true }) }
      };

      const comparison = SchemaUtils.compare(oldSchema, newSchema);
      expect(comparison.breakingChanges).toBe(true);
    });
  });

  describe('legacy schema migration', () => {
    it('should migrate simple legacy schema', () => {
      const legacySchema = {
        name: 'string',
        age: 'integer',
        active: 'boolean'
      };

      const migratedSchema = SchemaUtils.migrate(legacySchema);
      expect(migratedSchema.fields).toBeDefined();
      expect(migratedSchema.fields.name.type).toBe('string');
      expect(migratedSchema.fields.age.type).toBe('int');
      expect(migratedSchema.fields.active.type).toBe('bool');
    });

    it('should migrate complex legacy schema', () => {
      const legacySchema = {
        id: { type: 'uuid', unique: true, nullable: false },
        email: { type: 'varchar', unique: true, validation: 'string::is::email($value)' },
        createdAt: { type: 'timestamp', default: 'now()' }
      };

      const migratedSchema = SchemaUtils.migrate(legacySchema);
      expect(migratedSchema.fields.id.type).toBe('uuid');
      expect(migratedSchema.fields.id.constraints?.unique).toBe(true);
      expect(migratedSchema.fields.id.constraints?.nullable).toBe(false);
      expect(migratedSchema.fields.email.type).toBe('string');
      expect(migratedSchema.fields.email.constraints?.assert).toBe('string::is::email($value)');
    });
  });
});

describe('SchemaBuilder', () => {
  it('should build basic schema', () => {
    const schema = createSchema('users')
      .addField('id', FieldBuilder.uuid({ required: true }))
      .addField('name', FieldBuilder.string({ required: true }))
      .addField('email', FieldBuilder.email())
      .addIndex(IndexBuilder.primary())
      .build();

    expect(schema.fields).toBeDefined();
    expect(Object.keys(schema.fields)).toHaveLength(3);
    expect(schema.indexes).toHaveLength(1);
  });

  it('should add multiple fields at once', () => {
    const schema = createSchema('posts')
      .addFields({
        id: FieldBuilder.uuid({ required: true }),
        title: FieldBuilder.string({ required: true }),
        content: FieldBuilder.string(),
        published: FieldBuilder.boolean()
      })
      .build();

    expect(Object.keys(schema.fields)).toHaveLength(4);
  });

  it('should add audit fields', () => {
    const schema = createSchema('documents')
      .addField('title', FieldBuilder.string({ required: true }))
      .addAuditFields()
      .build();

    expect(schema.fields.createdAt).toBeDefined();
    expect(schema.fields.updatedAt).toBeDefined();
    expect(schema.fields.version).toBeDefined();
  });

  it('should add soft delete support', () => {
    const schema = createSchema('users')
      .addField('name', FieldBuilder.string({ required: true }))
      .addSoftDelete()
      .build();

    expect(schema.fields.deletedAt).toBeDefined();
    expect(schema.indexes?.some(idx => idx.fields.includes('deletedAt'))).toBe(true);
  });

  it('should add multi-tenant support', () => {
    const schema = createSchema('documents')
      .addField('id', FieldBuilder.uuid({ required: true }))
      .addField('title', FieldBuilder.string({ required: true }))
      .addMultiTenant()
      .build();

    expect(schema.fields.tenantId).toBeDefined();
    expect(schema.indexes?.some(idx => idx.fields.includes('tenantId'))).toBe(true);
  });

  it('should add suggested indexes', () => {
    const schema = createSchema('users')
      .addField('id', FieldBuilder.uuid({ unique: true }))
      .addField('email', FieldBuilder.email())
      .addField('name', FieldBuilder.string())
      .addSuggestedIndexes()
      .build();

    expect(schema.indexes?.length).toBeGreaterThan(0);
  });

  it('should validate schema during build', () => {
    expect(() => {
      createSchema('invalid')
        .build(); // No fields added
    }).toThrow('Schema validation failed');
  });

  it('should build with warnings', () => {
    const result = createSchema('users')
      .addField('type', FieldBuilder.string()) // Reserved keyword
      .buildWithWarnings();

    expect(result.schema).toBeDefined();
    expect(result.validation.warnings.length).toBeGreaterThan(0);
  });

  it('should generate SurrealDB statements', () => {
    const builder = createSchema('users')
      .addField('id', FieldBuilder.uuid({ required: true }))
      .addField('name', FieldBuilder.string({ required: true, minLength: 2 }))
      .addIndex(IndexBuilder.primary());

    const statements = builder.generateSurrealDBStatements();
    
    expect(statements.some(stmt => stmt.includes('DEFINE TABLE users'))).toBe(true);
    expect(statements.some(stmt => stmt.includes('DEFINE FIELD id'))).toBe(true);
    expect(statements.some(stmt => stmt.includes('DEFINE FIELD name'))).toBe(true);
    expect(statements.some(stmt => stmt.includes('DEFINE INDEX primary'))).toBe(true);
  });
});

describe('SchemaMigrationManager', () => {
  let manager: SchemaMigrationManager;

  beforeEach(() => {
    manager = createMigrationManager();
  });

  it('should add and retrieve schema versions', () => {
    const version = {
      version: '1.0.0',
      timestamp: Date.now(),
      description: 'Initial schema',
      schema: { fields: { name: FieldBuilder.string() } },
      migrations: []
    };

    manager.addVersion(version);
    expect(manager.getCurrentVersion()).toBe('1.0.0');
  });

  it('should create migration plan', () => {
    const v1Schema = { fields: { name: FieldBuilder.string() } };
    const v2Schema = { fields: { 
      name: FieldBuilder.string(),
      email: FieldBuilder.email()
    }};

    manager.addVersion({
      version: '1.0.0',
      timestamp: Date.now(),
      description: 'Initial',
      schema: v1Schema,
      migrations: []
    });

    manager.addVersion({
      version: '2.0.0',
      timestamp: Date.now(),
      description: 'Add email',
      schema: v2Schema,
      migrations: []
    });

    const plan = manager.createMigrationPlan('1.0.0', '2.0.0', 'users');
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.version).toBe('2.0.0');
  });

  it('should validate migration plan', () => {
    const plan = {
      version: '2.0.0',
      steps: [],
      totalSteps: 0,
      breakingChanges: false
    };

    const validation = manager.validateMigrationPlan(plan);
    expect(validation.valid).toBe(true);
    expect(validation.warnings).toContain('Migration plan contains no steps');
  });
});