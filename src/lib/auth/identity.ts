export function sessionDisplayLabel(user: { name?: unknown; email?: unknown }) {
    for (const value of [user.name, user.email]) {
        if (typeof value !== "string") continue;
        const label = value.trim();
        if (label && label.length <= 255 && !/[\p{Cc}]/u.test(label)) return label;
    }
    return null;
}
