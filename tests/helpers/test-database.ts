const TEST_DATABASES = new Set(["studyspace_test", "studyspace_test_recovery"]);

export type TestDatabaseUrlKey = "DIRECT_URL" | "DATABASE_URL" | "FAVORITES_DATABASE_URL";
export type TestDatabaseEnvironment = Record<string, string | undefined>;

export function getTestDatabaseName(environment: TestDatabaseEnvironment = process.env) {
    const configured = environment.STUDYSPACE_TEST_DATABASE;
    const database = configured === undefined ? "studyspace_test" : configured;
    if (!TEST_DATABASES.has(database)) {
        throw new Error("STUDYSPACE_TEST_DATABASE must be studyspace_test or studyspace_test_recovery");
    }
    return database;
}

export function getTestDatabaseUrl(
    key: TestDatabaseUrlKey,
    environment: TestDatabaseEnvironment = process.env,
) {
    const value = environment[key];
    if (!value) throw new Error(`${key} is missing`);

    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`Unsafe ${key}: expected a local studyspace_dev PostgreSQL URL`);
    }

    if (
        !["postgres:", "postgresql:"].includes(url.protocol) ||
        !["localhost", "127.0.0.1"].includes(url.hostname) ||
        url.pathname !== "/studyspace_dev"
    ) {
        throw new Error(`Unsafe ${key}: expected a local studyspace_dev PostgreSQL URL`);
    }

    url.pathname = `/${getTestDatabaseName(environment)}`;
    url.search = "";
    url.hash = "";
    return url.toString();
}
