interface SecurityHeaderOptions {
    development: boolean;
    appBaseUrl?: string;
}

export function contentSecurityPolicy({ development, appBaseUrl }: SecurityHeaderOptions) {
    const https = appBaseUrl?.startsWith("https://") ?? false;
    return [
        "default-src 'self'",
        `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""}`,
        "script-src-attr 'none'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        "connect-src 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "manifest-src 'self'",
        ...(https && !development ? ["upgrade-insecure-requests"] : []),
    ].join("; ");
}

export function securityHeaders(options: SecurityHeaderOptions) {
    const headers = [
        { key: "Content-Security-Policy", value: contentSecurityPolicy(options) },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    if (!options.development && options.appBaseUrl?.startsWith("https://")) {
        headers.push({
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
        });
    }
    return headers;
}
