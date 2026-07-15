// RLS isolation test: verify that two accounts' data are mutually invisible.
// This is the critical Phase 0 gate — if RLS fails, tenancy is broken.
//
// Run this in the Supabase SQL editor or via supabase functions test.
// Manual test: create two test accounts + users via the Supabase UI, then query
// as each user and verify cross-account data is blocked.

// (Full RLS test requires service-role key, which is backend-only)

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

async function runTests() {
  console.log("=== RLS Isolation Tests (Phase 0) ===\n");

  // Test 1: Create two accounts and verify tenant isolation.
  // This would normally be done via a dashboard/API, but for this test we'd
  // use Supabase service-role key (backend-only) to seed test data, then
  // query as each account's user with the anon key.
  //
  // Since service-role is backend-only, this test framework is a template.
  // The actual test workflow:
  // 1. Use Supabase service-role (in a backend script or the SQL editor with
  //    RLS disabled) to create:
  //    - Account A with user_A
  //    - Account B with user_B
  //    - Membership A for user_A
  //    - Membership B for user_B
  // 2. Query as user_A with supabase client → should see only Account A
  // 3. Query as user_B with supabase client → should see only Account B
  // 4. Try to read Account A's data as user_B → should be blocked (403/empty)

  results.push({
    name: "RLS Backbone: Accounts table isolation",
    passed: false, // placeholder
    error:
      "Manual test required: use Supabase service-role to seed test data (2 accounts, 2 users, 2 memberships), then query as each user and verify cross-account data is blocked.",
  });

  // Print results
  console.log("Test Results:");
  results.forEach((r) => {
    const status = r.passed ? "✓ PASS" : "✗ FAIL";
    console.log(`${status} ${r.name}`);
    if (r.error) console.log(`  └─ ${r.error}`);
  });

  const passCount = results.filter((r) => r.passed).length;
  console.log(`\n${passCount}/${results.length} passed\n`);

  if (passCount < results.length) {
    console.warn(
      "⚠ Phase 0 incomplete: manual RLS isolation test required before proceeding to Phase 1.",
    );
  }
}

// Export for manual invocation
export { runTests };

// If run as a script, execute immediately
if (typeof globalThis !== "undefined" && globalThis.window === undefined) {
  runTests().catch(console.error);
}
