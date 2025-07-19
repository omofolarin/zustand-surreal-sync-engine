import type { FieldDefinition, IndexDefinition, FieldConstraints } from '../types';

/**
 * String field options interface
 */
export interface StringFieldOptions {
  required?: boolean;
  unique?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  default?: string;
  enum?: string[];
  trim?: boolean;
  lowercase?: boolean;
  uppercase?: boolean;
}

/**
 * Number field options interface
 */
export interface NumberFieldOptions {
  required?: boolean;
  unique?: boolean;
  min?: number;
  max?: number;
  default?: number;
  integer?: boolean;
  positive?: boolean;
  multipleOf?: number;
}

/**
 * DateTime field options interface
 */
export interface DateTimeFieldOptions {
  required?: boolean;
  autoNow?: boolean;
  autoNowAdd?: boolean;
  default?: string | Date;
  minDate?: string | Date;
  maxDate?: string | Date;
}

/**
 * Array field options interface
 */
export interface ArrayFieldOptions {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  default?: any[];
  unique?: boolean;
}

/**
 * Record field options interface
 */
export interface RecordFieldOptions {
  required?: boolean;
  cascade?: boolean;
  onDelete?: 'cascade' | 'restrict' | 'set_null';
}

/**
 * Object field options interface
 */
export interface ObjectFieldOptions {
  required?: boolean;
  default?: any;
  schema?: Record<string, FieldDefinition>;
}

/**
 * Creates a field definition with common patterns
 */
export const FieldBuilder = {
  string: (options: StringFieldOptions = {}): FieldDefinition => {
    const constraints: FieldConstraints = {
      nullable: !options.required
    };
    
    if (options.unique !== undefined) {
      constraints.unique = options.unique;
    }
    
    if (options.default !== undefined) {
      constraints.default = options.default;
    }
    
    const assertions: string[] = [];
    
    // Length constraints
    if (options.minLength !== undefined) {
      assertions.push(`string::len($value) >= ${options.minLength}`);
    }
    if (options.maxLength !== undefined) {
      assertions.push(`string::len($value) <= ${options.maxLength}`);
    }
    
    // Pattern matching
    if (options.pattern) {
      assertions.push(`string::matches($value, "${options.pattern}")`);
    }
    
    // Enum validation
    if (options.enum && options.enum.length > 0) {
      const enumValues = options.enum.map(v => `"${v}"`).join(', ');
      assertions.push(`$value INSIDE [${enumValues}]`);
    }
    
    // Text transformations
    if (options.trim) {
      constraints.value = 'string::trim($value)';
    }
    if (options.lowercase) {
      constraints.value = constraints.value 
        ? `string::lowercase(${constraints.value})` 
        : 'string::lowercase($value)';
    }
    if (options.uppercase) {
      constraints.value = constraints.value 
        ? `string::uppercase(${constraints.value})` 
        : 'string::uppercase($value)';
    }
    
    if (assertions.length > 0) {
      constraints.assert = assertions.join(' AND ');
    }
    
    return { type: 'string', constraints };
  },

  email: (required = true): FieldDefinition => ({
    type: 'string',
    constraints: {
      nullable: !required,
      unique: true,
      assert: 'string::is::email($value)'
    }
  }),

  number: (options: NumberFieldOptions = {}): FieldDefinition => {
    const type = options.integer ? 'int' : 'decimal';
    const constraints: FieldConstraints = {
      nullable: !options.required
    };
    
    if (options.unique !== undefined) {
      constraints.unique = options.unique;
    }
    
    if (options.default !== undefined) {
      constraints.default = options.default;
    }
    
    const assertions: string[] = [];
    
    // Range constraints
    if (options.min !== undefined) {
      assertions.push(`$value >= ${options.min}`);
    }
    if (options.max !== undefined) {
      assertions.push(`$value <= ${options.max}`);
    }
    
    // Positive number constraint
    if (options.positive) {
      assertions.push(`$value > 0`);
    }
    
    // Multiple of constraint
    if (options.multipleOf !== undefined) {
      assertions.push(`$value % ${options.multipleOf} = 0`);
    }
    
    if (assertions.length > 0) {
      constraints.assert = assertions.join(' AND ');
    }
    
    return { type, constraints };
  },

  integer: (options: Omit<NumberFieldOptions, 'integer'> = {}): FieldDefinition => {
    return FieldBuilder.number({ ...options, integer: true });
  },

  decimal: (options: Omit<NumberFieldOptions, 'integer'> = {}): FieldDefinition => {
    return FieldBuilder.number({ ...options, integer: false });
  },

  float: (options: Omit<NumberFieldOptions, 'integer'> = {}): FieldDefinition => {
    const constraints: FieldConstraints = {
      nullable: !options.required
    };
    
    if (options.unique !== undefined) {
      constraints.unique = options.unique;
    }
    
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
    if (options.positive) {
      assertions.push(`$value > 0`);
    }
    
    if (assertions.length > 0) {
      constraints.assert = assertions.join(' AND ');
    }
    
    return { type: 'float', constraints };
  },

  boolean: (defaultValue = false): FieldDefinition => ({
    type: 'bool',
    constraints: {
      nullable: false,
      default: defaultValue
    }
  }),

  datetime: (options: DateTimeFieldOptions = {}): FieldDefinition => {
    const constraints: FieldConstraints = {
      nullable: !options.required
    };
    
    if (options.autoNowAdd) {
      constraints.default = 'time::now()';
    } else if (options.default !== undefined) {
      if (options.default instanceof Date) {
        constraints.default = `d"${options.default.toISOString()}"`;
      } else {
        constraints.default = options.default;
      }
    }
    
    if (options.autoNow) {
      constraints.value = 'time::now()';
    }
    
    const assertions: string[] = [];
    
    // Date range constraints
    if (options.minDate !== undefined) {
      const minDate = options.minDate instanceof Date 
        ? `d"${options.minDate.toISOString()}"` 
        : options.minDate;
      assertions.push(`$value >= ${minDate}`);
    }
    if (options.maxDate !== undefined) {
      const maxDate = options.maxDate instanceof Date 
        ? `d"${options.maxDate.toISOString()}"` 
        : options.maxDate;
      assertions.push(`$value <= ${maxDate}`);
    }
    
    if (assertions.length > 0) {
      constraints.assert = assertions.join(' AND ');
    }
    
    return { type: 'datetime', constraints };
  },

  date: (options: DateTimeFieldOptions = {}): FieldDefinition => {
    return { ...FieldBuilder.datetime(options), type: 'date' };
  },

  time: (options: Omit<DateTimeFieldOptions, 'minDate' | 'maxDate'> = {}): FieldDefinition => {
    const constraints: FieldConstraints = {
      nullable: !options.required
    };
    
    if (options.default !== undefined) {
      constraints.default = options.default;
    }
    
    return { type: 'time', constraints };
  },

  duration: (options: { required?: boolean; default?: string } = {}): FieldDefinition => {
    const constraints: FieldConstraints = {
      nullable: !options.required
    };
    
    if (options.default !== undefined) {
      constraints.default = options.default;
    }
    
    return { type: 'duration', constraints };
  },

  array: (itemType: string, options: ArrayFieldOptions = {}): FieldDefinition => {
    const constraints: FieldConstraints = {
      nullable: !options.required,
      default: options.default || []
    };
    
    const assertions: string[] = [];
    
    // Length constraints
    if (options.minLength !== undefined) {
      assertions.push(`array::len($value) >= ${options.minLength}`);
    }
    if (options.maxLength !== undefined) {
      assertions.push(`array::len($value) <= ${options.maxLength}`);
    }
    
    // Unique elements constraint
    if (options.unique) {
      assertions.push(`array::len($value) = array::len(array::distinct($value))`);
    }
    
    if (assertions.length > 0) {
      constraints.assert = assertions.join(' AND ');
    }
    
    return { type: `array<${itemType}>`, constraints };
  },

  set: (itemType: string, options: ArrayFieldOptions = {}): FieldDefinition => {
    return { ...FieldBuilder.array(itemType, { ...options, unique: true }), type: `set<${itemType}>` };
  },

  record: (table: string, options: RecordFieldOptions = {}): FieldDefinition => {
    const required = options.required !== false;
    const constraints: FieldConstraints = {
      nullable: !required
    };
    
    if (required) {
      constraints.assert = '$value != NONE';
    }
    
    // Add cascade behavior for foreign key relationships
    if (options.cascade || options.onDelete) {
      // This would be handled at the table level in SurrealDB
      // but we can store the intent in the field definition
      constraints.permissions = {
        delete: options.onDelete === 'cascade' ? 'true' : 
                options.onDelete === 'restrict' ? 'false' : 
                options.onDelete === 'set_null' ? 'SET NULL' : 'true'
      };
    }
    
    return {
      type: `record<${table}>`,
      constraints
    };
  },

  object: (options: ObjectFieldOptions = {}): FieldDefinition => {
    const constraints: FieldConstraints = {
      nullable: !options.required,
      default: options.default || {}
    };
    
    // If a schema is provided for the object, we could validate it
    // This is more advanced and would require custom validation logic
    if (options.schema) {
      // Store schema information for potential validation
      // In a real implementation, this might be used for nested validation
      constraints.assert = 'type::is::object($value)';
    }
    
    return { type: 'object', constraints };
  },

  // Specialized field types
  uuid: (options: { required?: boolean; default?: string } = {}): FieldDefinition => {
    const constraints: FieldConstraints = {
      nullable: !options.required
    };
    
    if (options.default !== undefined) {
      constraints.default = options.default;
    } else if (options.required) {
      constraints.default = 'rand::uuid::v4()';
    }
    
    constraints.assert = 'string::is::uuid($value)';
    
    return { type: 'uuid', constraints };
  },

  url: (options: { required?: boolean; default?: string } = {}): FieldDefinition => {
    const constraints: FieldConstraints = {
      nullable: !options.required,
      assert: 'string::is::url($value)'
    };
    
    if (options.default !== undefined) {
      constraints.default = options.default;
    }
    
    return { type: 'string', constraints };
  },

  json: (options: { required?: boolean; default?: any } = {}): FieldDefinition => {
    const constraints: FieldConstraints = {
      nullable: !options.required
    };
    
    if (options.default !== undefined) {
      constraints.default = options.default;
    }
    
    return { type: 'object', constraints };
  },

  geometry: (geometryType?: 'point' | 'line' | 'polygon' | 'multipoint' | 'multiline' | 'multipolygon' | 'collection', options: { required?: boolean } = {}): FieldDefinition => {
    const constraints: FieldConstraints = {
      nullable: !options.required
    };
    
    if (geometryType) {
      constraints.assert = `type::is::${geometryType}($value)`;
    }
    
    return { type: 'geometry', constraints };
  },

  // Convenience methods for common patterns
  id: (): FieldDefinition => FieldBuilder.uuid({ required: true }),
  
  createdAt: (): FieldDefinition => FieldBuilder.datetime({ 
    required: true, 
    autoNowAdd: true 
  }),
  
  updatedAt: (): FieldDefinition => FieldBuilder.datetime({ 
    required: true, 
    autoNow: true 
  }),
  
  version: (): FieldDefinition => FieldBuilder.integer({ 
    required: true, 
    default: 1, 
    min: 1 
  }),

  slug: (options: { required?: boolean; unique?: boolean } = {}): FieldDefinition => 
    FieldBuilder.string({
      ...options,
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
      lowercase: true,
      trim: true
    }),

  phoneNumber: (options: { required?: boolean } = {}): FieldDefinition => 
    FieldBuilder.string({
      ...options,
      pattern: '^\\+?[1-9]\\d{1,14}$'
    }),

  ipAddress: (options: { required?: boolean; version?: 4 | 6 } = {}): FieldDefinition => {
    const pattern = options.version === 6 
      ? '^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$'
      : '^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$';
    
    return FieldBuilder.string({
      required: options.required,
      pattern
    });
  },

  currency: (options: { required?: boolean; currency?: string; min?: number; max?: number } = {}): FieldDefinition => {
    const constraints: FieldConstraints = {
      nullable: !options.required
    };
    
    const assertions: string[] = [];
    
    if (options.min !== undefined) {
      assertions.push(`$value >= ${options.min}`);
    }
    if (options.max !== undefined) {
      assertions.push(`$value <= ${options.max}`);
    }
    
    // Ensure precision for currency (2 decimal places)
    assertions.push('$value = math::round($value * 100) / 100');
    
    if (assertions.length > 0) {
      constraints.assert = assertions.join(' AND ');
    }
    
    return { type: 'decimal', constraints };
  },

  percentage: (options: { required?: boolean } = {}): FieldDefinition => 
    FieldBuilder.decimal({
      ...options,
      min: 0,
      max: 100
    }),

  rating: (maxRating: number = 5, options: { required?: boolean } = {}): FieldDefinition => 
    FieldBuilder.integer({
      ...options,
      min: 1,
      max: maxRating
    })
};

/**
 * Index options interface
 */
export interface IndexOptions {
  unique?: boolean;
  type?: 'btree' | 'hash' | 'fulltext';
  order?: 'asc' | 'desc';
  sparse?: boolean;
  background?: boolean;
}

/**
 * Creates common index patterns
 */
export const IndexBuilder = {
  /**
   * Create a unique index on specified fields
   */
  unique: (name: string, fields: string[], options: Omit<IndexOptions, 'unique'> = {}): IndexDefinition => ({
    name,
    fields,
    unique: true,
    type: options.type || 'btree'
  }),

  /**
   * Create a composite index on multiple fields
   */
  composite: (name: string, fields: string[], options: IndexOptions = {}): IndexDefinition => ({
    name,
    fields,
    unique: options.unique || false,
    type: options.type || 'btree'
  }),

  /**
   * Create a full-text search index
   */
  fulltext: (name: string, fields: string[]): IndexDefinition => ({
    name,
    fields,
    type: 'fulltext' as const,
    unique: false
  }),

  /**
   * Create a hash index for exact matches
   */
  hash: (name: string, fields: string[], options: Omit<IndexOptions, 'type'> = {}): IndexDefinition => ({
    name,
    fields,
    unique: options.unique || false,
    type: 'hash' as const
  }),

  /**
   * Create a B-tree index (default type)
   */
  btree: (name: string, fields: string[], options: Omit<IndexOptions, 'type'> = {}): IndexDefinition => ({
    name,
    fields,
    unique: options.unique || false,
    type: 'btree' as const
  }),

  /**
   * Create a single field index
   */
  single: (fieldName: string, options: IndexOptions = {}): IndexDefinition => ({
    name: `idx_${fieldName}`,
    fields: [fieldName],
    unique: options.unique || false,
    type: options.type || 'btree'
  }),

  /**
   * Create a primary key index
   */
  primary: (fieldName: string = 'id'): IndexDefinition => ({
    name: 'primary',
    fields: [fieldName],
    unique: true,
    type: 'btree' as const
  }),

  /**
   * Create a foreign key index
   */
  foreignKey: (fieldName: string, referencedTable: string): IndexDefinition => ({
    name: `fk_${fieldName}_${referencedTable}`,
    fields: [fieldName],
    unique: false,
    type: 'btree' as const
  }),

  /**
   * Create an index for sorting/ordering
   */
  sort: (fieldName: string, order: 'asc' | 'desc' = 'asc'): IndexDefinition => ({
    name: `sort_${fieldName}_${order}`,
    fields: [fieldName],
    unique: false,
    type: 'btree' as const
  }),

  /**
   * Create a partial index with conditions
   */
  partial: (name: string, fields: string[], condition: string, options: IndexOptions = {}): IndexDefinition => ({
    name,
    fields,
    unique: options.unique || false,
    type: options.type || 'btree'
    // Note: SurrealDB doesn't directly support partial indexes like PostgreSQL
    // This would need to be implemented at the query level
  }),

  /**
   * Create common indexes for a table
   */
  common: {
    /**
     * Create standard indexes for audit fields
     */
    audit: (): IndexDefinition[] => [
      IndexBuilder.single('createdAt'),
      IndexBuilder.single('updatedAt'),
      IndexBuilder.single('version')
    ],

    /**
     * Create indexes for user-related fields
     */
    user: (): IndexDefinition[] => [
      IndexBuilder.unique('email_unique', ['email']),
      IndexBuilder.single('username'),
      IndexBuilder.single('status')
    ],

    /**
     * Create indexes for hierarchical data
     */
    hierarchy: (parentField: string = 'parentId'): IndexDefinition[] => [
      IndexBuilder.single(parentField),
      IndexBuilder.composite('hierarchy_path', [parentField, 'id'])
    ],

    /**
     * Create indexes for soft-deleted records
     */
    softDelete: (deletedField: string = 'deletedAt'): IndexDefinition[] => [
      IndexBuilder.single(deletedField),
      IndexBuilder.composite('active_records', ['id', deletedField])
    ],

    /**
     * Create indexes for multi-tenant applications
     */
    multiTenant: (tenantField: string = 'tenantId'): IndexDefinition[] => [
      IndexBuilder.single(tenantField),
      IndexBuilder.composite('tenant_records', [tenantField, 'id'])
    ]
  },

  /**
   * Analyze fields and suggest optimal indexes
   */
  suggest: (schema: Record<string, FieldDefinition>): IndexDefinition[] => {
    const suggestions: IndexDefinition[] = [];
    
    for (const [fieldName, fieldDef] of Object.entries(schema)) {
      // Suggest unique index for unique fields
      if (fieldDef.constraints?.unique) {
        suggestions.push(IndexBuilder.unique(`${fieldName}_unique`, [fieldName]));
      }
      
      // Suggest index for foreign key fields
      if (fieldDef.type.startsWith('record<')) {
        suggestions.push(IndexBuilder.foreignKey(fieldName, fieldDef.type));
      }
      
      // Suggest full-text index for string fields that might be searched
      if (fieldDef.type === 'string' && !fieldDef.constraints?.unique) {
        const fieldNameLower = fieldName.toLowerCase();
        if (fieldNameLower.includes('name') || 
            fieldNameLower.includes('title') || 
            fieldNameLower.includes('description') ||
            fieldNameLower.includes('content')) {
          suggestions.push(IndexBuilder.fulltext(`${fieldName}_search`, [fieldName]));
        }
      }
      
      // Suggest index for commonly filtered fields
      if (fieldName === 'status' || fieldName === 'type' || fieldName === 'category') {
        suggestions.push(IndexBuilder.single(fieldName));
      }
    }
    
    return suggestions;
  },

  /**
   * Validate index definition
   */
  validate: (index: IndexDefinition, schema: Record<string, FieldDefinition>): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    if (!index.name) {
      errors.push('Index must have a name');
    }
    
    if (!index.fields || index.fields.length === 0) {
      errors.push('Index must specify at least one field');
    }
    
    // Check if all indexed fields exist in schema
    for (const field of index.fields || []) {
      if (!schema[field]) {
        errors.push(`Index '${index.name}' references non-existent field '${field}'`);
      }
    }
    
    // Validate index type compatibility
    if (index.type === 'fulltext') {
      for (const field of index.fields || []) {
        const fieldDef = schema[field];
        if (fieldDef) {
          const baseType = fieldDef.type.split('<')[0];
          const isStringType = fieldDef.type === 'string' || 
                              fieldDef.type.startsWith('array<string>') || 
                              fieldDef.type.startsWith('set<string>');
          if (!isStringType) {
            errors.push(`Full-text index '${index.name}' can only be applied to string fields, but '${field}' is ${fieldDef.type}`);
          }
        }
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
};