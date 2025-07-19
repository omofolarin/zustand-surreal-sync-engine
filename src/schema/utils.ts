import type { TableSchema, FieldDefinition, TableConfig, IndexDefinition } from '../types';
import { IndexBuilder } from './builders';

/**
 * Schema migration options
 */
export interface SchemaMigrationOptions {
  preserveData?: boolean;
  addMissingIndexes?: boolean;
  strictMode?: boolean;
  backupBeforeMigration?: boolean;
}

/**
 * Schema comparison result
 */
export interface SchemaComparisonResult {
  identical: boolean;
  differences: SchemaDifference[];
  migrationRequired: boolean;
  breakingChanges: boolean;
}

/**
 * Schema difference types
 */
export interface SchemaDifference {
  type: 'field_added' | 'field_removed' | 'field_modified' | 'index_added' | 'index_removed' | 'permission_changed';
  path: string;
  oldValue?: any;
  newValue?: any;
  breaking: boolean;
  description: string;
}

/**
 * Legacy schema format mapping
 */
const LEGACY_TYPE_MAPPING: Record<string, string> = {
  'text': 'string',
  'varchar': 'string',
  'char': 'string',
  'integer': 'int',
  'bigint': 'int',
  'smallint': 'int',
  'real': 'float',
  'double': 'float',
  'numeric': 'decimal',
  'timestamp': 'datetime',
  'date': 'date',
  'time': 'time',
  'boolean': 'bool',
  'json': 'object',
  'jsonb': 'object',
  'uuid': 'uuid',
  'blob': 'bytes',
  'binary': 'bytes'
};

/**
 * Migrates a legacy simple schema to the new enhanced schema format
 */
export function migrateLegacySchema(
  legacySchema: Record<string, string | any>, 
  options: SchemaMigrationOptions = {}
): TableSchema {
  const fields: Record<string, FieldDefinition> = {};
  
  for (const [fieldName, fieldConfig] of Object.entries(legacySchema)) {
    if (typeof fieldConfig === 'string') {
      // Simple string type mapping
      const mappedType = LEGACY_TYPE_MAPPING[fieldConfig.toLowerCase()] || fieldConfig;
      fields[fieldName] = {
        type: mappedType,
        constraints: {
          nullable: true // Default to nullable for legacy compatibility
        }
      };
    } else if (typeof fieldConfig === 'object' && fieldConfig !== null) {
      // Complex field configuration
      const type = fieldConfig.type || 'string';
      const mappedType = LEGACY_TYPE_MAPPING[type.toLowerCase()] || type;
      
      fields[fieldName] = {
        type: mappedType,
        constraints: {
          nullable: fieldConfig.nullable !== false,
          unique: fieldConfig.unique || false,
          default: fieldConfig.default,
          assert: fieldConfig.validation || fieldConfig.assert
        }
      };
    }
  }
  
  // Add suggested indexes if requested
  const indexes: IndexDefinition[] = [];
  if (options.addMissingIndexes) {
    indexes.push(...IndexBuilder.suggest(fields));
  }
  
  return {
    fields,
    indexes,
    permissions: {
      select: 'true',
      create: 'true', 
      update: 'true',
      delete: 'true'
    }
  };
}

/**
 * Schema validation options
 */
export interface SchemaValidationOptions {
  strict?: boolean;
  checkReferences?: boolean;
  validateConstraints?: boolean;
  checkIndexes?: boolean;
}

/**
 * Schema validation result
 */
export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

/**
 * Validates a table schema for common issues
 */
export function validateSchema(
  schema: TableSchema, 
  options: SchemaValidationOptions = {}
): SchemaValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];
  
  const {
    strict = false,
    checkReferences = true,
    validateConstraints = true,
    checkIndexes = true
  } = options;
  
  // Check if schema has fields
  if (!schema.fields || Object.keys(schema.fields).length === 0) {
    errors.push('Schema must have at least one field defined');
    return { valid: false, errors, warnings, suggestions };
  }
  
  // Validate field definitions
  for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
    // Check required properties
    if (!fieldDef.type) {
      errors.push(`Field '${fieldName}' must have a type defined`);
      continue;
    }
    
    // Validate field name
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(fieldName)) {
      if (strict) {
        errors.push(`Field name '${fieldName}' contains invalid characters`);
      } else {
        warnings.push(`Field name '${fieldName}' should only contain letters, numbers, and underscores`);
      }
    }
    
    // Check for reserved field names
    const reservedNames = ['id', 'in', 'out', 'type', 'table'];
    if (reservedNames.includes(fieldName.toLowerCase())) {
      warnings.push(`Field name '${fieldName}' is a reserved keyword and may cause issues`);
    }
    
    // Validate field type
    const validTypes = [
      'string', 'int', 'float', 'decimal', 'bool', 'datetime', 'date', 'time', 
      'duration', 'uuid', 'object', 'array', 'set', 'geometry', 'bytes'
    ];
    
    const baseType = fieldDef.type.split('<')[0]; // Handle generic types like array<string>
    if (!validTypes.includes(baseType) && !fieldDef.type.startsWith('record<')) {
      if (strict) {
        errors.push(`Field '${fieldName}' has invalid type '${fieldDef.type}'`);
      } else {
        warnings.push(`Field '${fieldName}' has unrecognized type '${fieldDef.type}'`);
      }
    }
    
    // Validate constraints
    if (validateConstraints && fieldDef.constraints) {
      const constraints = fieldDef.constraints;
      
      // Validate assertion syntax
      if (constraints.assert) {
        if (!constraints.assert.includes('$value')) {
          errors.push(`Field '${fieldName}' assertion should reference $value`);
        }
        
        // Check for common assertion patterns
        if (constraints.assert.includes('&&') || constraints.assert.includes('||')) {
          suggestions.push(`Field '${fieldName}' assertion uses '&&' or '||' - consider using 'AND' or 'OR' for SurrealDB`);
        }
      }
      
      // Validate default values
      if (constraints.default !== undefined) {
        if (fieldDef.type === 'int' && typeof constraints.default !== 'number') {
          warnings.push(`Field '${fieldName}' has non-numeric default value for integer type`);
        }
        if (fieldDef.type === 'bool' && typeof constraints.default !== 'boolean') {
          warnings.push(`Field '${fieldName}' has non-boolean default value for boolean type`);
        }
      }
      
      // Check for conflicting constraints
      if (constraints.nullable === false && constraints.default === null) {
        errors.push(`Field '${fieldName}' is non-nullable but has null default value`);
      }
      
      // Validate permissions syntax
      if (constraints.permissions) {
        for (const [permType, permExpr] of Object.entries(constraints.permissions)) {
          if (typeof permExpr !== 'string') {
            errors.push(`Field '${fieldName}' permission '${permType}' must be a string expression`);
          }
          
          const validPermTypes = ['select', 'create', 'update', 'delete'];
          if (!validPermTypes.includes(permType)) {
            warnings.push(`Field '${fieldName}' has unrecognized permission type '${permType}'`);
          }
        }
      }
    }
    
    // Check for record references
    if (checkReferences && fieldDef.type.startsWith('record<')) {
      const referencedTable = fieldDef.type.match(/record<(.+)>/)?.[1];
      if (referencedTable) {
        suggestions.push(`Field '${fieldName}' references table '${referencedTable}' - ensure this table exists`);
      }
    }
  }
  
  // Validate indexes
  if (checkIndexes && schema.indexes) {
    const indexNames = new Set<string>();
    
    for (const index of schema.indexes) {
      // Check required properties
      if (!index.name) {
        errors.push('All indexes must have a name');
        continue;
      }
      
      // Check for duplicate index names
      if (indexNames.has(index.name)) {
        errors.push(`Duplicate index name '${index.name}'`);
      }
      indexNames.add(index.name);
      
      if (!index.fields || index.fields.length === 0) {
        errors.push(`Index '${index.name}' must specify at least one field`);
        continue;
      }
      
      // Check if indexed fields exist in schema
      for (const field of index.fields) {
        if (!schema.fields[field]) {
          errors.push(`Index '${index.name}' references non-existent field '${field}'`);
        }
      }
      
      // Validate index using IndexBuilder
      const indexValidation = IndexBuilder.validate(index, schema.fields);
      if (!indexValidation.valid) {
        errors.push(...indexValidation.errors);
      }
      
      // Suggest optimizations
      if (index.fields.length === 1 && !index.unique) {
        const fieldName = index.fields[0];
        const fieldDef = schema.fields[fieldName];
        if (fieldDef?.constraints?.unique) {
          suggestions.push(`Index '${index.name}' on unique field '${fieldName}' should be marked as unique`);
        }
      }
    }
    
    // Check for missing indexes on foreign keys
    for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
      if (fieldDef.type.startsWith('record<')) {
        const hasIndex = schema.indexes.some(idx => 
          idx.fields.length === 1 && idx.fields[0] === fieldName
        );
        if (!hasIndex) {
          suggestions.push(`Consider adding an index on foreign key field '${fieldName}'`);
        }
      }
    }
  }
  
  // Validate permissions
  if (schema.permissions) {
    const validPermTypes = ['select', 'create', 'update', 'delete'];
    for (const [permType, permExpr] of Object.entries(schema.permissions)) {
      if (!validPermTypes.includes(permType)) {
        warnings.push(`Unrecognized table permission type '${permType}'`);
      }
      if (typeof permExpr !== 'string') {
        errors.push(`Table permission '${permType}' must be a string expression`);
      }
    }
  }
  
  // Performance suggestions
  const fieldCount = Object.keys(schema.fields).length;
  if (fieldCount > 50) {
    suggestions.push(`Table has ${fieldCount} fields - consider normalizing into related tables`);
  }
  
  const indexCount = schema.indexes?.length || 0;
  if (indexCount > 10) {
    warnings.push(`Table has ${indexCount} indexes - too many indexes can impact write performance`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    suggestions
  };
}

/**
 * Compare two schemas and identify differences
 */
export function compareSchemas(
  oldSchema: TableSchema, 
  newSchema: TableSchema
): SchemaComparisonResult {
  const differences: SchemaDifference[] = [];
  
  // Compare fields
  const oldFields = oldSchema.fields || {};
  const newFields = newSchema.fields || {};
  
  // Check for removed fields
  for (const fieldName of Object.keys(oldFields)) {
    if (!newFields[fieldName]) {
      differences.push({
        type: 'field_removed',
        path: `fields.${fieldName}`,
        oldValue: oldFields[fieldName],
        breaking: true,
        description: `Field '${fieldName}' was removed`
      });
    }
  }
  
  // Check for added or modified fields
  for (const [fieldName, newFieldDef] of Object.entries(newFields)) {
    const oldFieldDef = oldFields[fieldName];
    
    if (!oldFieldDef) {
      // Field added
      const breaking = newFieldDef.constraints?.nullable === false && !newFieldDef.constraints?.default;
      differences.push({
        type: 'field_added',
        path: `fields.${fieldName}`,
        newValue: newFieldDef,
        breaking,
        description: `Field '${fieldName}' was added${breaking ? ' (non-nullable without default)' : ''}`
      });
    } else {
      // Check for field modifications
      if (oldFieldDef.type !== newFieldDef.type) {
        differences.push({
          type: 'field_modified',
          path: `fields.${fieldName}.type`,
          oldValue: oldFieldDef.type,
          newValue: newFieldDef.type,
          breaking: true,
          description: `Field '${fieldName}' type changed from '${oldFieldDef.type}' to '${newFieldDef.type}'`
        });
      }
      
      // Compare constraints
      const oldConstraints = oldFieldDef.constraints || {};
      const newConstraints = newFieldDef.constraints || {};
      
      if (oldConstraints.nullable !== newConstraints.nullable) {
        const breaking = newConstraints.nullable === false;
        differences.push({
          type: 'field_modified',
          path: `fields.${fieldName}.constraints.nullable`,
          oldValue: oldConstraints.nullable,
          newValue: newConstraints.nullable,
          breaking,
          description: `Field '${fieldName}' nullable constraint changed`
        });
      }
      
      if (oldConstraints.unique !== newConstraints.unique) {
        const breaking = newConstraints.unique === true;
        differences.push({
          type: 'field_modified',
          path: `fields.${fieldName}.constraints.unique`,
          oldValue: oldConstraints.unique,
          newValue: newConstraints.unique,
          breaking,
          description: `Field '${fieldName}' unique constraint changed`
        });
      }
    }
  }
  
  // Compare indexes
  const oldIndexes = oldSchema.indexes || [];
  const newIndexes = newSchema.indexes || [];
  
  const oldIndexMap = new Map(oldIndexes.map(idx => [idx.name, idx]));
  const newIndexMap = new Map(newIndexes.map(idx => [idx.name, idx]));
  
  // Check for removed indexes
  for (const [indexName, oldIndex] of oldIndexMap) {
    if (!newIndexMap.has(indexName)) {
      differences.push({
        type: 'index_removed',
        path: `indexes.${indexName}`,
        oldValue: oldIndex,
        breaking: false,
        description: `Index '${indexName}' was removed`
      });
    }
  }
  
  // Check for added indexes
  for (const [indexName, newIndex] of newIndexMap) {
    if (!oldIndexMap.has(indexName)) {
      differences.push({
        type: 'index_added',
        path: `indexes.${indexName}`,
        newValue: newIndex,
        breaking: false,
        description: `Index '${indexName}' was added`
      });
    }
  }
  
  // Compare permissions
  const oldPerms = oldSchema.permissions || {};
  const newPerms = newSchema.permissions || {};
  
  for (const permType of ['select', 'create', 'update', 'delete']) {
    if (oldPerms[permType] !== newPerms[permType]) {
      differences.push({
        type: 'permission_changed',
        path: `permissions.${permType}`,
        oldValue: oldPerms[permType],
        newValue: newPerms[permType],
        breaking: true,
        description: `Permission '${permType}' changed`
      });
    }
  }
  
  const breakingChanges = differences.some(diff => diff.breaking);
  const migrationRequired = differences.length > 0;
  
  return {
    identical: differences.length === 0,
    differences,
    migrationRequired,
    breakingChanges
  };
}

/**
 * Generate migration script for schema changes
 */
export function generateMigrationScript(
  tableName: string,
  oldSchema: TableSchema,
  newSchema: TableSchema,
  options: SchemaMigrationOptions = {}
): string[] {
  const comparison = compareSchemas(oldSchema, newSchema);
  const statements: string[] = [];
  
  if (!comparison.migrationRequired) {
    return statements;
  }
  
  // Add backup statement if requested
  if (options.backupBeforeMigration) {
    statements.push(`-- Backup table before migration`);
    statements.push(`CREATE TABLE ${tableName}_backup AS SELECT * FROM ${tableName};`);
    statements.push('');
  }
  
  // Process field changes
  for (const diff of comparison.differences) {
    switch (diff.type) {
      case 'field_added':
        const fieldName = diff.path.split('.')[1];
        const fieldDef = diff.newValue as FieldDefinition;
        statements.push(`-- Add field '${fieldName}'`);
        statements.push(`DEFINE FIELD ${fieldName} ON TABLE ${tableName} TYPE ${fieldDef.type};`);
        
        if (fieldDef.constraints) {
          if (fieldDef.constraints.default !== undefined) {
            statements.push(`DEFINE FIELD ${fieldName} ON TABLE ${tableName} DEFAULT ${JSON.stringify(fieldDef.constraints.default)};`);
          }
          if (fieldDef.constraints.assert) {
            statements.push(`DEFINE FIELD ${fieldName} ON TABLE ${tableName} ASSERT ${fieldDef.constraints.assert};`);
          }
        }
        break;
        
      case 'field_removed':
        if (options.preserveData) {
          statements.push(`-- Field '${diff.path.split('.')[1]}' marked for removal but preserved due to preserveData option`);
        } else {
          statements.push(`-- Remove field '${diff.path.split('.')[1]}'`);
          statements.push(`REMOVE FIELD ${diff.path.split('.')[1]} ON TABLE ${tableName};`);
        }
        break;
        
      case 'field_modified':
        const modifiedFieldName = diff.path.split('.')[1];
        statements.push(`-- Modify field '${modifiedFieldName}'`);
        // SurrealDB requires removing and re-adding fields for type changes
        if (diff.path.includes('.type')) {
          statements.push(`REMOVE FIELD ${modifiedFieldName} ON TABLE ${tableName};`);
          statements.push(`DEFINE FIELD ${modifiedFieldName} ON TABLE ${tableName} TYPE ${diff.newValue};`);
        }
        break;
        
      case 'index_added':
        const newIndex = diff.newValue as IndexDefinition;
        statements.push(`-- Add index '${newIndex.name}'`);
        const indexType = newIndex.type ? ` ${newIndex.type.toUpperCase()}` : '';
        const unique = newIndex.unique ? ' UNIQUE' : '';
        statements.push(`DEFINE INDEX ${newIndex.name} ON TABLE ${tableName} FIELDS ${newIndex.fields.join(', ')}${unique}${indexType};`);
        break;
        
      case 'index_removed':
        const oldIndex = diff.oldValue as IndexDefinition;
        statements.push(`-- Remove index '${oldIndex.name}'`);
        statements.push(`REMOVE INDEX ${oldIndex.name} ON TABLE ${tableName};`);
        break;
        
      case 'permission_changed':
        const permType = diff.path.split('.')[1];
        statements.push(`-- Update ${permType} permission`);
        statements.push(`DEFINE TABLE ${tableName} PERMISSIONS FOR ${permType} WHERE ${diff.newValue};`);
        break;
    }
    statements.push('');
  }
  
  return statements;
}

/**
 * Helper to upgrade a table config from legacy to enhanced schema
 */
export function upgradeTableConfig(
  config: TableConfig, 
  options: SchemaMigrationOptions = {}
): TableConfig {
  // If already using enhanced schema, return as-is
  if (config.schema && typeof config.schema === 'object' && 'fields' in config.schema) {
    return config;
  }
  
  // If using legacy schema, migrate it
  if (config.legacySchema) {
    return {
      ...config,
      schema: migrateLegacySchema(config.legacySchema, options)
    };
  }
  
  // Assume the schema property contains legacy format
  return {
    ...config,
    schema: migrateLegacySchema(config.schema as Record<string, string>, options)
  };
}

/**
 * Batch upgrade multiple table configurations
 */
export function upgradeMultipleTableConfigs(
  configs: Record<string, TableConfig>,
  options: SchemaMigrationOptions = {}
): { 
  upgraded: Record<string, TableConfig>;
  migrations: Record<string, string[]>;
  errors: Record<string, string[]>;
} {
  const upgraded: Record<string, TableConfig> = {};
  const migrations: Record<string, string[]> = {};
  const errors: Record<string, string[]> = {};
  
  for (const [tableName, config] of Object.entries(configs)) {
    try {
      const oldSchema = config.schema as any;
      const upgradedConfig = upgradeTableConfig(config, options);
      upgraded[tableName] = upgradedConfig;
      
      // Generate migration if there were changes
      if (oldSchema && typeof oldSchema === 'object' && !('fields' in oldSchema)) {
        const legacySchema = migrateLegacySchema(oldSchema, options);
        migrations[tableName] = generateMigrationScript(tableName, legacySchema, upgradedConfig.schema, options);
      }
    } catch (error) {
      errors[tableName] = [error instanceof Error ? error.message : String(error)];
    }
  }
  
  return { upgraded, migrations, errors };
}

/**
 * Schema utility functions
 */
export const SchemaUtils = {
  validate: validateSchema,
  compare: compareSchemas,
  migrate: migrateLegacySchema,
  upgrade: upgradeTableConfig,
  generateMigration: generateMigrationScript,
  batchUpgrade: upgradeMultipleTableConfigs
};