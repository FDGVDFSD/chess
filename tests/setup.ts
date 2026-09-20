// Legacy server tests require an owner seed password.
// This value exists only inside the test process and is never used by production.
process.env.OWNER_INITIAL_PASSWORD ??= "chess-arena-test-owner-password";
