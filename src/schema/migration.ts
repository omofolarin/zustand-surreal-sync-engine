import type { TableSchema, FieldDefinition, IndexDefinition, TableConfig } from '../types';
import { SchemaUtils, SchemaMigrationOptions, SchemaValidationOptions } from './utils';
import { IndexBuilder } from './builders';

/**
 * Migration step interface
 */
export interface MigrationStep {
  id: string;
  description: string;
  up: string[];
  down: string[];
  breaking: boolean;
  dependencies?: string[];
}

/**
 * Migration plan interface
 */
export interface MigrationPlan {
  version: string;
  steps: MigrationStep[];
  totalSteps: number;
  breakingChanges: boolean;
  estimatedTime?: number;
}

/**
 * Schema evolution tracking
 */
export interface SchemaVersion {
  version: string;
  timestamp: number;
  description: string;
  schema: TableSchema;
  migrations: MigrationStep[];
}

/**
 * Advanced schema migration manager
 */
export class SchemaMigrationManager {
  private versions: Map<string, SchemaVersion> = new Map();
  private currentVersion: string = '1.0.0';

  /**
   * Add a schema version to the migration history
   */
  addVersion(version: SchemaVersion): void {
    this.versions.set(version.version, version);
  }

  /**
   * Get current schema version
   */
  getCurrentVersion(): string {
    return this.currentVersion;
  }

  /**
   * Set current schema version
   */
  setCurrentVersion(version: string): void {
    if (!this.versions.has(version)) {
      throw new Error(`Schema version '${version}' not found`);
    }
    this.currentVersion = version;
  }

  /**
   * Create a migration plan between two schema versions
   */
  createMigrationPlan(
    fromVersion: string,
    toVersion: string,
    tableName: string
  ): MigrationPlan {
    const fromSchema = this.versions.get(fromVersion);
    const toSchema = this.versions.get(toVersion);

    if (!fromSchema || !toSchema) {
      throw new Error(`Schema version not found: ${!fromSchema ? fromVersion : toVersion}`);
    }

    const comparison = SchemaUtils.compare(fromSchema.schema, toSchema.schema);
    const steps: MigrationStep[] = [];

    if (comparison.migrationRequired) {
      const migrationStatements = SchemaUtils.generateMigration(
        tableName,
        fromSchema.schema,
        toSchema.schema
      );

      steps.push({
        id: `migrate_${fromVersion}_to_${toVersion}`,
        description: `Migrate schema from ${fromVersion} to ${toVersion}`,
        up: migrationStatements,
        down: this.generateRollbackStatements(comparison.differences, tableName),
        breaking: comparison.breakingChanges
      });
    }

    return {
      version: toVersion,
      steps,
      totalSteps: steps.length,
      breakingChanges: comparison.breakingChanges,
      estimatedTime: this.estimateMigrationTime(steps)
    };
  }

  /**
   * Generate rollback statements for migration differences
   */
  private generateRollbackStatements(differences: any[], tableName: string): string[] {
    const rollbackStatements: string[] = [];

    // Reverse the order of operations for rollback
    for (const diff of differences.reverse()) {
      switch (diff.type) {
        case 'field_added':
          rollbackStatements.push(`REMOVE FIELD ${diff.path.split('.')[1]} ON TABLE ${tableName};`);
          break;
        case 'field_removed':
          const fieldDef = diff.oldValue as FieldDefinition;
          rollbackStatements.push(`DEFINE FIELD ${diff.path.split('.')[1]} ON TABLE ${tableName} TYPE ${fieldDef.type};`);
          break;
        case 'index_added':
          rollbackStatements.push(`REMOVE INDEX ${(diff.newValue as IndexDefinition).name} ON TABLE ${tableName};`);
          break;
        case 'index_removed':
          const index = diff.oldValue as IndexDefinition;
          const unique = index.unique ? ' UNIQUE' : '';
          rollbackStatements.push(`DEFINE INDEX ${index.name} ON TABLE ${tableName} FIELDS ${index.fields.join(', ')}${unique};`);
          break;
      }
    }

    return rollbackStatements;
  }

  /**
   * Estimate migration time based on complexity
   */
  private estimateMigrationTime(steps: MigrationStep[]): number {
    let estimatedSeconds = 0;

    for (const step of steps) {
      // Base time per statement
      estimatedSeconds += step.up.length * 0.1;

      // Additional time for breaking changes
      if (step.breaking) {
        estimatedSeconds += 5;
      }

      // Additional time for index operations
      const indexOperations = step.up.filter(stmt => 
        stmt.includes('DEFINE INDEX') || stmt.includes('REMOVE INDEX')
      ).length;
      estimatedSeconds += indexOperations * 2;
    }

    return Math.max(estimatedSeconds, 1);
  }

  /**
   * Validate migration plan before execution
   */
  validateMigrationPlan(plan: MigrationPlan): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (plan.steps.length === 0) {
      warnings.push('Migration plan contains no steps');
      return { valid: true, errors, warnings };
    }

    // Check for dependency cycles
    const stepIds = new Set(plan.steps.map(step => step.id));
    for (const step of plan.steps) {
      if (step.dependencies) {
        for (const dep of step.dependencies) {
          if (!stepIds.has(dep)) {
            errors.push(`Step '${step.id}' depends on non-existent step '${dep}'`);
          }
        }
      }
    }

    // Warn about breaking changes
    if (plan.breakingChanges) {
      warnings.push('Migration plan contains breaking changes that may affect existing data');
    }

    // Warn about long migration times
    if (plan.estimatedTime && plan.estimatedTime > 60) {
      warnings.push(`Migration estimated to take ${Math.round(plan.estimatedTime)} seconds`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
}

/**
 * Schema builder with validation and migration support
 */
export class SchemaBuilder {
  private schema: Partial<TableSchema> = {};
  private tableName: string;

  constructor(tableName: string) {
    this.tableName = tableName;
    this.schema = {
      fields: {},
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
   * Add a field to the schema
   */
  addField(name: string, definition: FieldDefinition): this {
    if (!this.schema.fields) {
      this.schema.fields = {};
    }
    this.schema.fields[name] = definition;
    return this;
  }

  /**
   * Add multiple fields to the schema
   */
  addFields(fields: Record<string, FieldDefinition>): this {
    if (!this.schema.fields) {
      this.schema.fields = {};
    }
    Object.assign(this.schema.fields, fields);
    return this;
  }

  /**
   * Add an index to the schema
   */
  addIndex(index: IndexDefinition): this {
    if (!this.schema.indexes) {
      this.schema.indexes = [];
    }
    this.schema.indexes.push(index);
    return this;
  }

  /**
   * Add multiple indexes to the schema
   */
  addIndexes(indexes: IndexDefinition[]): this {
    if (!this.schema.indexes) {
      this.schema.indexes = [];
    }
    this.schema.indexes.push(...indexes);
    return this;
  }

  /**
   * Set table permissions
   */
  setPermissions(permissions: TableSchema['permissions']): this {
    this.schema.permissions = permissions;
    return this;
  }

  /**
   * Add suggested indexes based on field definitions
   */
  addSuggestedIndexes(): this {
    if (this.schema.fields) {
      const suggested = IndexBuilder.suggest(this.schema.fields);
      const existingIndexNames = new Set((this.schema.indexes || []).map(idx => idx.name));
      
      // Only add suggested indexes that don't conflict with existing ones
      const nonConflictingSuggestions = suggested.filter(idx => !existingIndexNames.has(idx.name));
      this.addIndexes(nonConflictingSuggestions);
    }
    return this;
  }

  /**
   * Add common audit fields (createdAt, updatedAt, version)
   */
  addAuditFields(): this {
    return this.addFields({
      createdAt: { type: 'datetime', constraints: { nullable: false, default: 'time::now()' } },
      updatedAt: { type: 'datetime', constraints: { nullable: false, value: 'time::now()' } },
      version: { type: 'int', constraints: { nullable: false, default: 1, assert: '$value >= 1' } }
    });
  }

  /**
   * Add soft delete support
   */
  addSoftDelete(fieldName: string = 'deletedAt'): this {
    return this.addField(fieldName, {
      type: 'datetime',
      constraints: { nullable: true }
    }).addIndex(IndexBuilder.single(fieldName));
  }

  /**
   * Add multi-tenancy support
   */
  addMultiTenant(tenantField: string = 'tenantId'): this {
    return this.addField(tenantField, {
      type: 'uuid',
      constraints: { nullable: false }
    }).addIndexes(IndexBuilder.common.multiTenant(tenantField));
  }

  /**
   * Validate the current schema
   */
  validate(options: SchemaValidationOptions = {}): ReturnType<typeof SchemaUtils.validate> {
    return SchemaUtils.validate(this.schema as TableSchema, options);
  }

  /**
   * Build and return the final schema
   */
  build(): TableSchema {
    const validation = this.validate({ strict: true });
    if (!validation.valid) {
      throw new Error(`Schema validation failed: ${validation.errors.join(', ')}`);
    }
    return this.schema as TableSchema;
  }

  /**
   * Build with warnings (non-strict validation)
   */
  buildWithWarnings(): { schema: TableSchema; validation: ReturnType<typeof SchemaUtils.validate> } {
    const validation = this.validate();
    if (!validation.valid) {
      throw new Error(`Schema validation failed: ${validation.errors.join(', ')}`);
    }
    return {
      schema: this.schema as TableSchema,
      validation
    };
  }

  /**
   * Generate SurrealDB schema definition statements
   */
  generateSurrealDBStatements(): string[] {
    const schema = this.build();
    const statements: string[] = [];

    // Define table
    statements.push(`DEFINE TABLE ${this.tableName} SCHEMAFULL;`);
    statements.push('');

    // Define fields
    for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
      statements.push(`DEFINE FIELD ${fieldName} ON TABLE ${this.tableName} TYPE ${fieldDef.type};`);
      
      if (fieldDef.constraints) {
        if (fieldDef.constraints.default !== undefined) {
          statements.push(`DEFINE FIELD ${fieldName} ON TABLE ${this.tableName} DEFAULT ${JSON.stringify(fieldDef.constraints.default)};`);
        }
        if (fieldDef.constraints.value) {
          statements.push(`DEFINE FIELD ${fieldName} ON TABLE ${this.tableName} VALUE ${fieldDef.constraints.value};`);
        }
        if (fieldDef.constraints.assert) {
          statements.push(`DEFINE FIELD ${fieldName} ON TABLE ${this.tableName} ASSERT ${fieldDef.constraints.assert};`);
        }
      }
    }

    statements.push('');

    // Define indexes
    for (const index of schema.indexes || []) {
      const unique = index.unique ? ' UNIQUE' : '';
      const type = index.type ? ` ${index.type.toUpperCase()}` : '';
      statements.push(`DEFINE INDEX ${index.name} ON TABLE ${this.tableName} FIELDS ${index.fields.join(', ')}${unique}${type};`);
    }

    if (schema.indexes && schema.indexes.length > 0) {
      statements.push('');
    }

    // Define permissions
    if (schema.permissions) {
      for (const [permType, permExpr] of Object.entries(schema.permissions)) {
        statements.push(`DEFINE TABLE ${this.tableName} PERMISSIONS FOR ${permType} WHERE ${permExpr};`);
      }
    }

    return statements;
  }
}

/**
 * Factory function to create a new schema builder
 */
export function createSchema(tableName: string): SchemaBuilder {
  return new SchemaBuilder(tableName);
}

/**
 * Factory function to create a migration manager
 */
export function createMigrationManager(): SchemaMigrationManager {
  return new SchemaMigrationManager();
}