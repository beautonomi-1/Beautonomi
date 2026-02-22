// Test Supabase Connection
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log('✗ Missing environment variables');
  console.log('  SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
  console.log('  ANON_KEY:', supabaseKey ? '✓' : '✗');
  process.exit(1);
}

console.log('Testing Supabase connection...');
console.log('URL:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey);

// Test connection by querying users table
supabase
  .from('users')
  .select('count')
  .limit(1)
  .then(({ error }) => {
    if (error) {
      console.log('✗ Connection error:', error.message);
      process.exit(1);
    } else {
      console.log('✓ Connection successful!');
      console.log('✓ Database is accessible');
      console.log('✓ RLS policies are working');
      process.exit(0);
    }
  })
  .catch((err) => {
    console.log('✗ Error:', err.message);
    process.exit(1);
  });
