const DEFAULT_POOL_SIZE = 5;
const MAX_POOL_SIZE = 20;

export function configuredPoolSize(name: "DATABASE_POOL_MAX" | "PRIVATE_DATABASE_POOL_MAX") {
    const value = process.env[name];
    if (value === undefined || value === "") return DEFAULT_POOL_SIZE;
    if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer from 1 to ${MAX_POOL_SIZE}.`);
    const size = Number(value);
    if (size < 1 || size > MAX_POOL_SIZE) throw new Error(`${name} must be an integer from 1 to ${MAX_POOL_SIZE}.`);
    return size;
}
