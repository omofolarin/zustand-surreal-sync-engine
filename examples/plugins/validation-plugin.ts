import type { Plugin, PluginHooks } from '../../src/features/plugins';
import type { ChangeRecord } from '../../src/core/types';

/**
 * Validation Plugin - Validates data before sync operations
 * 
 * This plugin demonstrates how to:
 * - Validate data before sync operations
 * - Transform data during sync
 * - Provide custom validation rules
 * - Handle validation errors
 */

interface ValidationRule {
  field: string;
  type: 'required' | 'email' | 'minLength' | 'maxLength' | 'pattern' | 'custom';
  value?: any;
  message?: string;
  validator?: (value: any) => boolean;
}

interface ValidationSchema {
  table: string;
  rules: ValidationRule[];
}

class DataValidator {
  private schemas = new Map<string, ValidationSchema>();
  
  addSchema(schema: ValidationSchema): void {
    this.schemas.set(schema.table, schema);
  }
  
  removeSchema(table: string): void {
    this.schemas.delete(table);
  }
  
  validate(table: string, data: any): { valid: boolean; errors: string[] } {
    const schema = this.schemas.get(table);
    if (!schema) {
      return { valid: true, errors: [] };
    }
    
    const errors: string[] = [];
    
    for (const rule of schema.rules) {
      const value = this.getNestedValue(data, rule.field);
      const error = this.validateField(rule, value);
      
      if (error) {
        errors.push(error);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  private validateField(rule: ValidationRule, value: any): string | null {
    switch (rule.type) {
      case 'required':
        if (value === undefined || value === null || value === '') {
          return rule.message || `Field ${rule.field} is required`;
        }
        break;
        
      case 'email':
        if (value && typeof value === 'string') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(value)) {
            return rule.message || `Field ${rule.field} must be a valid email`;
          }
        }
        break;
        
      case 'minLength':
        if (value && typeof value === 'string' && value.length < (rule.value || 0)) {
          return rule.message || `Field ${rule.field} must be at least ${rule.value} characters`;
        }
        break;
        
      case 'maxLength':
        if (value && typeof value === 'string' && value.length > (rule.value || 0)) {
          return rule.message || `Field ${rule.field} must be no more than ${rule.value} characters`;
        }
        break;
        
      case 'pattern':
        if (value && typeof value === 'string' && rule.value instanceof RegExp) {
          if (!rule.value.test(value)) {
            return rule.message || `Field ${rule.field} does not match required pattern`;
          }
        }
        break;
        
      case 'custom':
        if (rule.validator && !rule.validator(value)) {
          return rule.message || `Field ${rule.field} failed custom validation`;
        }
        break;
    }
    
    return null;
  }
  
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }
}

const validator = new DataValidator();

// Add some default schemas
validator.addSchema({
  table: 'users',
  rules: [
    { field: 'email', type: 'required' },
    { field: 'email', type: 'email' },
    { field: 'name', type: 'required' },
    { field: 'name', type: 'minLength', value: 2 },
    { field: 'password', type: 'minLength', value: 8, message: 'Password must be at least 8 characters' }
  ]
});

validator.addSchema({
  table: 'todos',
  rules: [
    { field: 'text', type: 'required' },
    { field: 'text', type: 'minLength', value: 1 },
    { field: 'text', type: 'maxLength', value: 500 }
  ]
});

const hooks: PluginHooks = {
  beforeSync: async (data: ChangeRecord) => {
    // Only validate CREATE and UPDATE operations
    if (data.operation === 'DELETE') {
      return data;
    }
    
    const validation = validator.validate(data.table, data.data);
    
    if (!validation.valid) {
      const error = new Error(`Validation failed: ${validation.errors.join(', ')}`);
      throw error;
    }
    
    return data;
  },
  
  beforeCreate: async (table: string, data: any) => {
    const validation = validator.validate(table, data);
    
    if (!validation.valid) {
      throw new Error(`Create validation failed: ${validation.errors.join(', ')}`);
    }
    
    // Transform data (e.g., trim strings, normalize email)
    return this.transformData(data);
  },
  
  beforeUpdate: async (table: string, id: string, data: any) => {
    const validation = validator.validate(table, data);
    
    if (!validation.valid) {
      throw new Error(`Update validation failed: ${validation.errors.join(', ')}`);
    }
    
    // Transform data
    return this.transformData(data);
  }
};

// Data transformation helper
function transformData(data: any): any {
  const transformed = { ...data };
  
  // Trim all string values
  for (const [key, value] of Object.entries(transformed)) {
    if (typeof value === 'string') {
      transformed[key] = value.trim();
    }
  }
  
  // Normalize email
  if (transformed.email && typeof transformed.email === 'string') {
    transformed.email = transformed.email.toLowerCase();
  }
  
  return transformed;
}

export const ValidationPlugin: Plugin = {
  name: 'data-validator',
  version: '1.0.0',
  description: 'Data validation and transformation plugin',
  author: 'Sync Engine Team',
  
  hooks,
  
  config: {
    strictMode: true,
    transformData: true,
    customValidators: {}
  },
  
  operations: {
    'add-validation-schema': async (data: { schema: ValidationSchema }) => {
      validator.addSchema(data.schema);
      return { success: true, message: `Schema added for table ${data.schema.table}` };
    },
    
    'remove-validation-schema': async (data: { table: string }) => {
      validator.removeSchema(data.table);
      return { success: true, message: `Schema removed for table ${data.table}` };
    },
    
    'validate-data': async (data: { table: string; data: any }) => {
      return validator.validate(data.table, data.data);
    },
    
    'add-custom-validator': async (data: { 
      table: string; 
      field: string; 
      validator: (value: any) => boolean;
      message?: string;
    }) => {
      const schema = validator['schemas'].get(data.table);
      if (schema) {
        schema.rules.push({
          field: data.field,
          type: 'custom',
          validator: data.validator,
          message: data.message
        });
        return { success: true, message: 'Custom validator added' };
      }
      return { success: false, message: 'Table schema not found' };
    }
  },
  
  initialize: async (syncEngine: any) => {
    console.log('Validation Plugin initialized - data validation enabled');
  },
  
  destroy: async () => {
    console.log('Validation Plugin destroyed');
  },
  
  validateConfig: async (config: any) => {
    return typeof config === 'object' && 
           typeof config.strictMode === 'boolean';
  },
  
  healthCheck: async () => {
    // Test validation with sample data
    const testResult = validator.validate('users', {
      email: 'test@example.com',
      name: 'Test User'
    });
    
    return testResult.valid;
  }
};

// Export validator for external access
export { validator };