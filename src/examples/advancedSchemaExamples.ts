import type { SyncConfig, TableSchema } from '../types';

/**
 * Advanced Schema Examples for SurrealDB Integration
 * 
 * This file demonstrates various advanced schema features including:
 * - Field constraints (unique, nullable, assertions)
 * - Default values and computed values
 * - Indexes (simple, composite, unique)
 * - Permissions at table and field level
 * - Events and triggers
 */

// Example 1: User Management with Advanced Constraints
export const userTableSchema: TableSchema = {
  fields: {
    email: {
      type: 'string',
      constraints: {
        unique: true,
        nullable: false,
        assert: 'string::is::email($value)',
        permissions: {
          select: 'id = $auth.id OR $auth.role = "admin"',
          update: 'id = $auth.id OR $auth.role = "admin"'
        }
      }
    },
    username: {
      type: 'string',
      constraints: {
        unique: true,
        nullable: false,
        assert: 'string::len($value) >= 3 AND string::len($value) <= 20 AND string::is::alphanum($value)'
      }
    },
    password_hash: {
      type: 'string',
      constraints: {
        nullable: false,
        permissions: {
          select: 'NONE', // Never allow password hash to be selected
          create: '$auth.role = "admin" OR id = $auth.id',
          update: '$auth.role = "admin" OR id = $auth.id'
        }
      }
    },
    profile: {
      type: 'object',
      constraints: {
        default: {
          firstName: '',
          lastName: '',
          avatar: null,
          bio: ''
        }
      }
    },
    role: {
      type: 'string',
      constraints: {
        default: 'user',
        assert: '$value IN ["user", "admin", "moderator"]'
      }
    },
    isActive: {
      type: 'bool',
      constraints: {
        default: true,
        nullable: false
      }
    },
    lastLoginAt: {
      type: 'datetime',
      constraints: {
        nullable: true
      }
    },
    createdAt: {
      type: 'datetime',
      constraints: {
        default: 'time::now()',
        nullable: false
      }
    },
    updatedAt: {
      type: 'datetime',
      constraints: {
        value: 'time::now()' // Always set to current time on update
      }
    }
  },
  indexes: [
    {
      name: 'idx_email_unique',
      fields: ['email'],
      unique: true
    },
    {
      name: 'idx_username_unique',
      fields: ['username'],
      unique: true
    },
    {
      name: 'idx_role_active',
      fields: ['role', 'isActive']
    },
    {
      name: 'idx_created_at',
      fields: ['createdAt']
    }
  ],
  permissions: {
    select: '$auth != NONE',
    create: 'true', // Allow user registration
    update: 'id = $auth.id OR $auth.role = "admin"',
    delete: '$auth.role = "admin"'
  },
  events: {
    'AFTER CREATE': 'fn::send_welcome_email($after.email)',
    'AFTER UPDATE': 'fn::log_user_update($before, $after)',
    'BEFORE DELETE': 'fn::cleanup_user_data($before.id)'
  }
};

// Example 2: Blog Posts with Rich Content and Relationships
export const blogPostSchema: TableSchema = {
  fields: {
    title: {
      type: 'string',
      constraints: {
        nullable: false,
        assert: 'string::len($value) >= 5 AND string::len($value) <= 200'
      }
    },
    slug: {
      type: 'string',
      constraints: {
        unique: true,
        nullable: false,
        assert: 'string::is::slug($value)'
      }
    },
    content: {
      type: 'string',
      constraints: {
        nullable: false,
        assert: 'string::len($value) >= 10'
      }
    },
    excerpt: {
      type: 'string',
      constraints: {
        value: 'string::slice($parent.content, 0, 200) + "..."'
      }
    },
    author: {
      type: 'record<users>',
      constraints: {
        nullable: false,
        assert: '$value != NONE'
      }
    },
    status: {
      type: 'string',
      constraints: {
        default: 'draft',
        assert: '$value IN ["draft", "published", "archived"]'
      }
    },
    tags: {
      type: 'array<string>',
      constraints: {
        default: [],
        assert: 'array::len($value) <= 10'
      }
    },
    metadata: {
      type: 'object',
      constraints: {
        default: {
          readTime: 0,
          wordCount: 0,
          featured: false
        }
      }
    },
    publishedAt: {
      type: 'datetime',
      constraints: {
        nullable: true,
        assert: '$parent.status = "published" ? $value != NONE : true'
      }
    },
    viewCount: {
      type: 'int',
      constraints: {
        default: 0,
        assert: '$value >= 0'
      }
    }
  },
  indexes: [
    {
      name: 'idx_slug_unique',
      fields: ['slug'],
      unique: true
    },
    {
      name: 'idx_author_status',
      fields: ['author', 'status']
    },
    {
      name: 'idx_published_at',
      fields: ['publishedAt']
    },
    {
      name: 'idx_tags',
      fields: ['tags']
    },
    {
      name: 'idx_title_content_fulltext',
      fields: ['title', 'content'],
      type: 'fulltext'
    }
  ],
  permissions: {
    select: '$auth != NONE AND (status = "published" OR author = $auth.id OR $auth.role = "admin")',
    create: '$auth != NONE',
    update: 'author = $auth.id OR $auth.role = "admin"',
    delete: 'author = $auth.id OR $auth.role = "admin"'
  },
  events: {
    'BEFORE CREATE': 'fn::generate_slug($value.title)',
    'AFTER CREATE': 'fn::notify_subscribers($after.author)',
    'BEFORE UPDATE': 'fn::update_word_count($value.content)',
    'AFTER UPDATE': 'IF $before.status != $after.status AND $after.status = "published" THEN fn::send_publication_notification($after.id) END'
  }
};

// Example 3: E-commerce Product with Complex Validation
export const productSchema: TableSchema = {
  fields: {
    sku: {
      type: 'string',
      constraints: {
        unique: true,
        nullable: false,
        assert: 'string::len($value) >= 3 AND string::len($value) <= 50'
      }
    },
    name: {
      type: 'string',
      constraints: {
        nullable: false,
        assert: 'string::len($value) >= 2 AND string::len($value) <= 200'
      }
    },
    description: {
      type: 'string',
      constraints: {
        nullable: true
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
        assert: '$value == NONE OR $value > $parent.price'
      }
    },
    inventory: {
      type: 'object',
      constraints: {
        default: {
          quantity: 0,
          trackQuantity: true,
          allowBackorder: false,
          lowStockThreshold: 5
        },
        assert: '$value.quantity >= 0'
      }
    },
    category: {
      type: 'record<categories>',
      constraints: {
        nullable: false
      }
    },
    vendor: {
      type: 'record<vendors>',
      constraints: {
        nullable: true
      }
    },
    images: {
      type: 'array<string>',
      constraints: {
        default: [],
        assert: 'array::len($value) <= 20'
      }
    },
    variants: {
      type: 'array<object>',
      constraints: {
        default: []
      }
    },
    seo: {
      type: 'object',
      constraints: {
        default: {
          title: '',
          description: '',
          keywords: []
        }
      }
    },
    isActive: {
      type: 'bool',
      constraints: {
        default: true,
        nullable: false
      }
    },
    weight: {
      type: 'decimal',
      constraints: {
        nullable: true,
        assert: '$value == NONE OR $value > 0'
      }
    },
    dimensions: {
      type: 'object',
      constraints: {
        nullable: true,
        assert: '$value == NONE OR ($value.length > 0 AND $value.width > 0 AND $value.height > 0)'
      }
    }
  },
  indexes: [
    {
      name: 'idx_sku_unique',
      fields: ['sku'],
      unique: true
    },
    {
      name: 'idx_category_active',
      fields: ['category', 'isActive']
    },
    {
      name: 'idx_vendor_active',
      fields: ['vendor', 'isActive']
    },
    {
      name: 'idx_price',
      fields: ['price']
    },
    {
      name: 'idx_name_description_fulltext',
      fields: ['name', 'description'],
      type: 'fulltext'
    }
  ],
  permissions: {
    select: 'isActive = true OR $auth.role IN ["admin", "vendor"]',
    create: '$auth.role IN ["admin", "vendor"]',
    update: '$auth.role = "admin" OR (vendor = $auth.id AND $auth.role = "vendor")',
    delete: '$auth.role = "admin"'
  },
  events: {
    'BEFORE CREATE': 'fn::validate_product_data($value)',
    'AFTER CREATE': 'fn::index_product_for_search($after)',
    'BEFORE UPDATE': 'fn::check_inventory_changes($before, $value)',
    'AFTER UPDATE': 'fn::update_search_index($after)'
  }
};

// Complete sync configuration example
export const advancedSyncConfig: SyncConfig = {
  dbName: 'advanced-app-db',
  namespace: 'production',
  database: 'main',
  tables: {
    users: {
      zustandPath: 'users',
      primaryKey: 'id',
      syncEnabled: true,
      schema: userTableSchema
    },
    posts: {
      zustandPath: 'posts',
      primaryKey: 'id',
      syncEnabled: true,
      schema: blogPostSchema
    },
    products: {
      zustandPath: 'products',
      primaryKey: 'id',
      syncEnabled: true,
      schema: productSchema
    }
  },
  conflictResolution: 'last-write-wins',
  syncInterval: 1000,
  retryAttempts: 3
};

// Helper function to create a schema with common patterns
export function createBaseSchema(customFields: Record<string, any>): TableSchema {
  return {
    fields: {
      ...customFields,
      createdAt: {
        type: 'datetime',
        constraints: {
          default: 'time::now()',
          nullable: false
        }
      },
      updatedAt: {
        type: 'datetime',
        constraints: {
          value: 'time::now()'
        }
      },
      isDeleted: {
        type: 'bool',
        constraints: {
          default: false,
          nullable: false
        }
      }
    },
    indexes: [
      {
        name: 'idx_created_at',
        fields: ['createdAt']
      },
      {
        name: 'idx_not_deleted',
        fields: ['isDeleted']
      }
    ],
    permissions: {
      select: 'isDeleted = false',
      create: '$auth != NONE',
      update: '$auth != NONE',
      delete: '$auth != NONE'
    }
  };
}