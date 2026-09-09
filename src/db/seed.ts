import { Client } from '@libsql/client';

export async function seedInitialData(client: Client) {
  // Seed initial data
  const seedStatements = [
    // Seed Default Branch
    `INSERT OR IGNORE INTO branches (id, branch_name, branch_code, city, status, created_at) VALUES ('BRANCH_MAIN', 'Head Office', 'MAIN-01', 'Lahore', 'ACTIVE', CURRENT_TIMESTAMP)`,
    
    // Seed Initial Super Admin Credentials (Username: dripp, Password: 5821)
    `INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, status, created_at, updated_at) VALUES (
      'USER_ADMIN_01',
      'dripp',
      '$2a$12$e6O.I/X0XyIe0N7.3Z9m0u2E3sJkXmZ.B5u4L8Y1R0nO9L2X4Q.2a',
      'System Administrator',
      'ADMIN',
      'ACTIVE',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )`,
    
    // Seed Agency Settings
    `INSERT OR IGNORE INTO agency_settings (id, agency_name, currency_symbol, created_at, updated_at) VALUES (
      'MAIN_SETTINGS',
      'Dripp Real Estate & DigiKhata ERP',
      'Rs.',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )`
  ];

  for (const statement of seedStatements) {
    try {
      await client.execute(statement);
    } catch (error) {
      console.error('[Seed Error]', error);
    }
  }
}