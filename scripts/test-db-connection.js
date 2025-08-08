// Test script to verify Supabase database connection
// Run with: node scripts/test-db-connection.js

const { neon } = require('@neondatabase/serverless');

async function testConnection() {
  if (!process.env.DATABASE_URL) {
    console.log('❌ DATABASE_URL environment variable not found');
    return;
  }

  console.log('🔍 Testing Supabase database connection...');
  
  // Encode the connection string properly
  let connectionString = process.env.DATABASE_URL;
  
  try {
    const url = new URL(connectionString);
    connectionString = `postgresql://${encodeURIComponent(url.username)}:${encodeURIComponent(url.password)}@${url.host}${url.pathname}${url.search}`;
    console.log('✅ Successfully encoded DATABASE_URL');
  } catch (error) {
    console.log('⚠️ Using DATABASE_URL as-is');
  }

  try {
    const sql = neon(connectionString);
    const result = await sql`SELECT current_database(), version(), now()`;
    
    console.log('✅ Database connection successful!');
    console.log('📊 Database:', result[0].current_database);
    console.log('🎯 PostgreSQL version:', result[0].version.split(' ')[0]);
    console.log('⏰ Server time:', result[0].now);
    
    // Test users table
    try {
      const users = await sql`SELECT COUNT(*) as count FROM users`;
      console.log('👥 Users in database:', users[0].count);
      
      const sampleUser = await sql`SELECT username, name, role FROM users LIMIT 1`;
      if (sampleUser.length > 0) {
        console.log('👤 Sample user:', sampleUser[0].username, '-', sampleUser[0].role);
      }
    } catch (tableError) {
      console.log('⚠️ Users table not accessible:', tableError.message);
    }
    
  } catch (error) {
    console.log('❌ Database connection failed:', error.message);
  }
}

testConnection();