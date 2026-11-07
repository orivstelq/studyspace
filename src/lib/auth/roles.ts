export function isModeratorSubject(subject: string, configured = process.env.AUTH0_MODERATOR_SUBJECTS) {
    if (!configured) return false;
    return configured.split(",").some((candidate) => candidate.trim() === subject);
}
