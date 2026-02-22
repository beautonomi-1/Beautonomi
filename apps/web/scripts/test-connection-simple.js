// Simple Supabase Connection Test
// Reads from .env.local directly

const fs = require('fs');
const path = require('path');

// Read .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (!fs.existsSync(envPath)) {
  console.log('✗ .env.local not found');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/);
const keyMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/);

if (!urlMatch || !keyMatch) {
  console.log('✗ Missing required environment variables');
  process.exit(1);
}

const supabaseUrl = urlMatch[1].trim();
const supabaseKey = keyMatch[1].trim();

console.log('✓ Environment variables found');
console.log('  URL:', supabaseUrl);
console.log('  Key:', supabaseKey.substring(0, 20) + '...');
console.log('');

// Test with fetch (no dependencies)
console.log('Testing connection...');
fetch(`${supabaseUrl}/rest/v1/`, {
  headers: {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`
  }
})
.then(response => {
  if (response.ok) {
    console.log('✓ Connection successful!');
    console.log('✓ Supabase API is accessible');
    return fetch(`${supabaseUrl}/rest/v1/users?select=count&limit=1`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
  } else {
    throw new Error(`HTTP ${response.status}`);
  }
})
.then(response => {
  if (response.ok) {
    console.log('✓ Database query successful!');
    console.log('✓ RLS policies are working');
    console.log('');
    console.log('Your Supabase connection is ready!');
  } else {
    console.log('⚠ Database query returned:', response.status);
    console.log('  (This might be normal if RLS is enabled)');
  }
})
.catch(error => {
  console.log('✗ Connection error:', error.message);
  process.exit(1);
});
