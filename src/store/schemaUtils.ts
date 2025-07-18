import type { TableSchema, FieldDefinition, TableConfig } from '../types';

/**
 * Schema utilities for working with enhanced SurrealDB schemas
 */

/**
 * Migrates a legacy simple schema to the new enhanced schema format
 */
export function migrateLegacySchema(legacySchema: Record<string, string>): TableSchema {
  const fields: Record<string, FieldDefinition> = {};
  
  for (const [fieldName, fieldType] of Object.entries(legacySchema)) {
    fields[fieldName] = {
      type: fieldType,
      constraints: {
        nullable: true // Default to nullable for legacy compatibility
      }
    };
  }
  
  return {
    fields,
    indexes: [],
    permissions: {
      select: 'true',
      create: 'true', 
      update: 'true',
      delete: 'true'
    }
  };
}

/**
 * Validates a table schema for common issues
 */
export function validateSchema(schema: TableSchema): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Check if schema has fields
  if (!schema.fields || Object.keys(schema.fields).length === 0) {
    errors.push('Schema must have at least one field defined');
  }
  
  // Validate field definitions
  for (const [fieldName, fieldDef] of Object.entries(schema.fields || {})) {
    if (!fieldDef.type) {
      errors.push(`Field '${fieldName}' must have a type defined`);
    }
    
    // Validate field constraints
    if (fieldDef.constraints) {
      const constraints = fieldDef.constraints;
      
      // Check for conflicting nullable and default
      if (constraints.nullable === false && constraints.default === undefined) {
        // This is actually fine - non-nullable fields can exist without defaults
        // if they're always provided during creation
      }
      
      // Validate assertion syntax (basic check)
      if (constraints.assert && !constraints.assert.includes('$value')) {
        errors.push(`Field '${fieldName}' assertion should reference $value`);
      }
      
      // Validate permissions syntax
      if (constraints.permissions) {
        const perms = constraints.permissions;
        for (const [permType, permExpr] of Object.entries(perms)) {
          if (typeof permExpr !== 'string') {
            errors.push(`Field '${fieldName}' permission '${permType}' must be a string expression`);
          }
        }
      }
    }
  }
  
  // Validate indexes
  if (schema.indexes) {
    for (const index of schema.indexes) {
      if (!index.name) {
        errors.push('All indexes must have a name');
      }
      
      if (!index.fields || index.fields.length === 0) {
        errors.push(`Index '${index.name}' must specify at least one field`);
      }
      
      // Check if indexed fields exist in schema
      for (const field of index.fields || []) {
        if (!schema.fields[field]) {
          errors.push(`Index '${index.name}' references non-existent field '${field}'`);
        }
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Creates a field definition with common patterns
 */
export const FieldBuilder = {
  string: (options: {
    required?: boolean;
    unique?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    default?: string;
  } = {}) => {
    const constraints: FieldDefinition['constraints'] = {
      nullable: !options.required,
      unique: options.unique
    };
    
    if (options.default !== undefined) {
      constraints.default = options.default;
    }
    
    const assertions: string[] = [];
    if (options.minLength !== undefined) {
      assertions.push(`string::len($value) >= ${options.minLength}`);
    }
    if (options.maxLength !== undefined) {
      assertions.push(`string::len($value) <= ${options.maxLength}`);
    }
    if (options.pattern) {
      assertions.push(`string::matches($value, "${options.pattern}")`);
    }
    
    if (assertions.length > 0) {
      constraints.assert = assertions.join(' AND ');
    }
    
    return { type: 'string', constraints };
  },

  email: (required = true) => ({
    type: 'string',
    constraints: {
      nullable: !required,
      unique: true,
      assert: 'string::is::email($value)'
    }
  }),

  number: (options: {
    required?: boolean;
    min?: number;
    max?: number;
    default?: number;
    integer?: boolean;
  } = {}) => {
    const type = options.integer ? 'int' : 'decimal';
    const constraints: FieldDefinition['constraints'] = {
      nullable: !options.required
    };
    
    if (options.default !== undefined) {
      constraints.default = options.default;
    }
    
    const assertions: string[] = [];
    if (options.min !== undefined) {
      assertions.push(`$value >= ${options.min}`);
    }
    if (options.max !== undefined) {
      assertions.push(`$value <= ${options.max}`);
    }
    
    if (assertions.length > 0) {
      constraints.assert = assertions.join(' AND ');
    }
    
    return { type, constraints };
  },

  boolean: (defaultValue = false) => ({
    type: 'bool',
    constraints: {
      nullable: false,
      default: defaultValue
    }
  }),

  datetime: (options: {
    required?: boolean;
    autoNow?: boolean;
    autoNowAdd?: boolean;
  } = {}) => {
    const constraints: FieldDefinition['constraints'] = {
      nullable: !options.required
    };
    
    if (options.autoNowAdd) {
      constraints.default = 'time::now()';
    }
    
    if (options.autoNow) {
      constraints.value = 'time::now()';
    }
    
    return { type: 'datetime', constraints };
  },

  array: (itemType: string, options: {
    maxLength?: number;
    default?: any[];
  } = {}) => {
    const constraints: FieldDefinition['constraints'] = {
      default: options.default || []
    };
    
    if (options.maxLength !== undefined) {
      constraints.assert = `array::len($value) <= ${options.maxLength}`;
    }
    
    return { type: `array<${itemType}>`, constraints };
  },

  record: (table: string, required = true) => ({
    type: `record<${table}>`,
    constraints: {
      nullable: !required,
      assert: required ? '$value != NONE' : undefined
    }
  }),

  object: (defaultValue: any = {}) => ({
    type: 'object',
    constraints: {
      default: defaultValue
    }
  })
};

/**
 * Creates common index patterns
 */
export const IndexBuilder = {
  unique: (name: string, fields: string[]) => ({
    name,
    fields,
    unique: true
  }),

  composite: (name: string, fields: string[]) => ({
    name,
    fields
  }),

  fulltext: (name: string, fields: string[]) => ({
    name,
    fields,
    type: 'fulltext' as const
  })
};

/**
 * Helper to upgrade a table config from legacy to enhanced schema
 */
export function upgradeTableConfig(config: TableConfig): TableConfig {
  // If already using enhanced schema, return as-is
  if ('fields' in config.schema) {
    return config;
  }
  
  // If using legacy schema, migrate it
  if (config.legacySchema) {
    return {
      ...config,
      schema: migrateLegacySchema(config.legacySchema),
      legacySchema: undefined
    };
  }
  
  // Assume the schema property contains legacy format
  return {
    ...config,
    schema: migrateLegacySchema(config.schema as Record<string, string>),
    legacySchema: config.schema as Record<string, string>
  };
}

/**
 * Example usage of the schema builder utilities
 */
export const exampleUserSchema: TableSchema = {
  fields: {
    email: FieldBuilder.email(true),
    username: FieldBuilder.string({
      required: true,
      unique: true,
      minLength: 3,
      maxLength: 20,
      pattern: '^[a-zA-Z0-9_]+$'
    }),
    age: FieldBuilder.number({
      required: false,
      min: 13,
      max: 120,
      integer: true
    }),
    isActive: FieldBuilder.boolean(true),
    profile: FieldBuilder.object({
      firstName: '',
      lastName: '',
      bio: ''
    }),
    tags: FieldBuilder.array('string', { maxLength: 10 }),
    createdAt: FieldBuilder.datetime({ required: true, autoNowAdd: true }),
    updatedAt: FieldBuilder.datetime({ autoNow: true })
  },
  indexes: [
    IndexBuilder.unique('idx_email', ['email']),
    IndexBuilder.unique('idx_username', ['username']),
    IndexBuilder.composite('idx_active_created', ['isActive', 'createdAt'])
  ],
  permissions: {
    select: '$auth != NONE',
    create: 'true',
    update: 'id = $auth.id OR $auth.role = "admin"',
    delete: '$auth.role = "admin"'
  }
};