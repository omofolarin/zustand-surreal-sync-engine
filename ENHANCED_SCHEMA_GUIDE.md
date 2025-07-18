# Enhanced Schema System for SurrealDB Integration

This guide explains how to use the enhanced schema system that supports advanced SurrealDB features like constraints, indexes, permissions, and events.

## Overview

The enhanced schema system provides:
- **Field Constraints**: unique, nullable, default values, assertions, and field-level permissions
- **Indexes**: simple, composite, unique, and full-text indexes
- **Table Permissions**: row-level security with SurrealQL expressions
- **Events**: database triggers for CREATE, UPDATE, DELETE operations
- **Validation**: schema validation and migration utilities
- **Builder Utilities**: convenient helpers for common patterns

## Basic Usage

### Simple Field Definition

```typescript
import { FieldBuilder, IndexBuilder } from './src/store/schemaUtils';
import type { TableSchema } from './src/types';

const userSchema: TableSchema = {
  fields: {
    email: FieldBuilder.email(true), // Required unique email
    username: FieldBuilder.string({
      required: true,
      unique: true,
      minLength: 3,
      maxLength: 20
    }),
    age: FieldBuilder.number({
      integer: true,
      min: 13,
      max: 120
    }),
    isActive: FieldBuilder.boolean(true),
    createdAt: FieldBuilder.datetime({ autoNowAdd: true })
  },
  indexes: [
    IndexBuilder.unique('idx_email', ['email']),
    IndexBuilder.composite('idx_active_created', ['isActive', 'createdAt'])
  ]
};
```

### Advanced Field Constraints

```typescript
const productSchema: TableSchema = {
  fields: {
    sku: {
      type: 'string',
      constraints: {
        unique: true,
        nullable: false,
        assert: 'string::len($value) >= 3 AND string::len($value) <= 50'
      }
    },
    price: {
      type: 'decimal',
      constraints: {
        nullable: false,
        assert: '$value > 0'
      }
    },
    compareAtPrice: {
      type: 'decimal',
      constraints: {
        nullable: true,
        assert: '$value == NONE OR $value > $parent.price' // Reference other fields
      }
    },
    inventory: {
      type: 'object',
      constraints: {
        default: {
          quantity: 0,
          trackQuantity: true,
          allowBackorder: false
        },
        assert: '$value.quantity >= 0'
      }
    }
  }
};
```

## Field Types and Constraints

### Supported Field Types
- `string` - Text data
- `int` - Integer numbers
- `decimal` - Decimal numbers
- `bool` - Boolean values
- `datetime` - Date and time
- `array<type>` - Arrays of specific types
- `object` - JSON objects
- `record<table>` - References to other tables

### Constraint Options

#### `nullable: boolean`
Controls whether the field can be null.
```typescript
email: {
  type: 'string',
  constraints: { nullable: false } // Required field
}
```

#### `unique: boolean`
Ensures field values are unique across all records.
```typescript
username: {
  type: 'string',
  constraints: { unique: true }
}
```

#### `default: any`
Sets a default value when records are created.
```typescript
status: {
  type: 'string',
  constraints: { default: 'active' }
}
```

#### `assert: string`
SurrealQL expression for field validation.
```typescript
age: {
  type: 'int',
  constraints: {
    assert: '$value >= 0 AND $value <= 150'
  }
}
```

#### `value: string`
SurrealQL expression that computes the field value.
```typescript
updatedAt: {
  type: 'datetime',
  constraints: {
    value: 'time::now()' // Always set to current time
  }
}
```

#### `permissions: object`
Field-level permissions for different operations.
```typescript
password: {
  type: 'string',
  constraints: {
    permissions: {
      select: 'NONE', // Never allow reading password
      update: 'id = $auth.id OR $auth.role = "admin"'
    }
  }
}
```

## Indexes

### Simple Index
```typescript
indexes: [
  {
    name: 'idx_email',
    fields: ['email']
  }
]
```

### Unique Index
```typescript
indexes: [
  {
    name: 'idx_username_unique',
    fields: ['username'],
    unique: true
  }
]
```

### Composite Index
```typescript
indexes: [
  {
    name: 'idx_status_created',
    fields: ['status', 'createdAt']
  }
]
```

### Full-text Index
```typescript
indexes: [
  {
    name: 'idx_content_search',
    fields: ['title', 'content'],
    type: 'fulltext'
  }
]
```

## Permissions

### Table-level Permissions
```typescript
permissions: {
  select: '$auth != NONE', // Must be authenticated
  create: '$auth.role = "user"', // Only users can create
  update: 'id = $auth.id OR $auth.role = "admin"', // Own records or admin
  delete: '$auth.role = "admin"' // Only admins can delete
}
```

### Common Permission Patterns
```typescript
// Public read, authenticated write
permissions: {
  select: 'true',
  create: '$auth != NONE',
  update: '$auth != NONE',
  delete: '$auth != NONE'
}

// Owner-based access
permissions: {
  select: 'owner = $auth.id OR $auth.role = "admin"',
  update: 'owner = $auth.id OR $auth.role = "admin"',
  delete: 'owner = $auth.id OR $auth.role = "admin"'
}

// Role-based access
permissions: {
  select: '$auth.role IN ["user", "admin"]',
  create: '$auth.role IN ["user", "admin"]',
  update: '$auth.role = "admin"',
  delete: '$auth.role = "admin"'
}
```

## Events and Triggers

```typescript
events: {
  'BEFORE CREATE': 'fn::validate_data($value)',
  'AFTER CREATE': 'fn::send_welcome_email($after.email)',
  'BEFORE UPDATE': 'fn::check_permissions($before, $value)',
  'AFTER UPDATE': 'fn::log_changes($before, $after)',
  'BEFORE DELETE': 'fn::cleanup_related_data($before.id)'
}
```

## Builder Utilities

### FieldBuilder Methods

#### `FieldBuilder.string(options)`
```typescript
// Basic string
name: FieldBuilder.string({ required: true })

// String with validation
username: FieldBuilder.string({
  required: true,
  unique: true,
  minLength: 3,
  maxLength: 20,
  pattern: '^[a-zA-Z0-9_]+$'
})
```

#### `FieldBuilder.email(required)`
```typescript
email: FieldBuilder.email(true) // Required unique email with validation
```

#### `FieldBuilder.number(options)`
```typescript
// Integer with range
age: FieldBuilder.number({
  integer: true,
  min: 0,
  max: 150,
  required: true
})

// Decimal with default
price: FieldBuilder.number({
  min: 0,
  default: 0.00
})
```

#### `FieldBuilder.boolean(defaultValue)`
```typescript
isActive: FieldBuilder.boolean(true)
```

#### `FieldBuilder.datetime(options)`
```typescript
// Auto-timestamp on create
createdAt: FieldBuilder.datetime({
  required: true,
  autoNowAdd: true
})

// Auto-timestamp on update
updatedAt: FieldBuilder.datetime({
  autoNow: true
})
```

#### `FieldBuilder.array(itemType, options)`
```typescript
tags: FieldBuilder.array('string', {
  maxLength: 10,
  default: []
})
```

#### `FieldBuilder.record(table, required)`
```typescript
author: FieldBuilder.record('users', true) // Required reference to users table
category: FieldBuilder.record('categories', false) // Optional reference
```

### IndexBuilder Methods

#### `IndexBuilder.unique(name, fields)`
```typescript
IndexBuilder.unique('idx_email', ['email'])
```

#### `IndexBuilder.composite(name, fields)`
```typescript
IndexBuilder.composite('idx_status_date', ['status', 'createdAt'])
```

#### `IndexBuilder.fulltext(name, fields)`
```typescript
IndexBuilder.fulltext('idx_search', ['title', 'content'])
```

## Migration from Legacy Schema

### Automatic Migration
The system automatically detects and migrates legacy schemas:

```typescript
// Legacy format (still supported)
const legacyConfig = {
  schema: {
    name: 'string',
    age: 'int',
    active: 'bool'
  }
};

// Automatically converted to enhanced format
```

### Manual Migration
```typescript
import { migrateLegacySchema } from './src/store/schemaUtils';

const legacySchema = {
  name: 'string',
  email: 'string',
  age: 'int'
};

const enhancedSchema = migrateLegacySchema(legacySchema);
```

## Complete Example

```typescript
import { FieldBuilder, IndexBuilder } from './src/store/schemaUtils';
import type { SyncConfig } from './src/types';

export const blogConfig: SyncConfig = {
  dbName: 'blog-app',
  namespace: 'production',
  database: 'main',
  tables: {
    posts: {
      zustandPath: 'posts',
      primaryKey: 'id',
      syncEnabled: true,
      schema: {
        fields: {
          title: FieldBuilder.string({
            required: true,
            minLength: 5,
            maxLength: 200
          }),
          slug: FieldBuilder.string({
            required: true,
            unique: true,
            pattern: '^[a-z0-9-]+$'
          }),
          content: FieldBuilder.string({
            required: true,
            minLength: 10
          }),
          author: FieldBuilder.record('users', true),
          status: {
            type: 'string',
            constraints: {
              default: 'draft',
              assert: '$value IN ["draft", "published", "archived"]'
            }
          },
          tags: FieldBuilder.array('string', { maxLength: 10 }),
          publishedAt: FieldBuilder.datetime({ required: false }),
          createdAt: FieldBuilder.datetime({
            required: true,
            autoNowAdd: true
          }),
          updatedAt: FieldBuilder.datetime({ autoNow: true })
        },
        indexes: [
          IndexBuilder.unique('idx_slug', ['slug']),
          IndexBuilder.composite('idx_author_status', ['author', 'status']),
          IndexBuilder.composite('idx_published', ['publishedAt']),
          IndexBuilder.fulltext('idx_search', ['title', 'content'])
        ],
        permissions: {
          select: 'status = "published" OR author = $auth.id OR $auth.role = "admin"',
          create: '$auth != NONE',
          update: 'author = $auth.id OR $auth.role = "admin"',
          delete: '$auth.role = "admin"'
        },
        events: {
          'BEFORE CREATE': 'fn::generate_slug($value.title)',
          'AFTER CREATE': 'fn::notify_subscribers($after.author)',
          'AFTER UPDATE': 'IF $before.status != $after.status AND $after.status = "published" THEN fn::send_publication_notification($after.id) END'
        }
      }
    }
  },
  conflictResolution: 'last-write-wins',
  syncInterval: 1000,
  retryAttempts: 3
};
```

## Best Practices

1. **Use Builder Utilities**: Prefer `FieldBuilder` and `IndexBuilder` for common patterns
2. **Validate Schemas**: Use `validateSchema()` to catch issues early
3. **Index Strategically**: Add indexes for frequently queried fields
4. **Secure by Default**: Always define appropriate permissions
5. **Test Assertions**: Ensure your assertion expressions work as expected
6. **Document Complex Logic**: Comment complex assertions and permissions
7. **Migration Path**: Plan for schema evolution and migrations

## Troubleshooting

### Common Issues

1. **Assertion Syntax Errors**: Ensure assertions use valid SurrealQL syntax
2. **Permission Conflicts**: Check that permissions don't conflict with constraints
3. **Index Failures**: Verify indexed fields exist in the schema
4. **Type Mismatches**: Ensure field types match your data

### Debugging

Enable detailed logging to see schema initialization:
```typescript
console.log('Schema validation:', validateSchema(yourSchema));
```

The enhanced schema system provides powerful capabilities while maintaining backward compatibility with existing applications.