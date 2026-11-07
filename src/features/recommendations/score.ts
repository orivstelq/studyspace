import type { ProfilePreferences } from "../profile/query";
import type { StudySpace } from "../discovery/types";

export interface ScoredSpace {
    space: StudySpace;
    score: number;
    reasons: string[];
}

export function scoreSpace(space: StudySpace, preferences: ProfilePreferences): ScoredSpace {
    let score = 0;
    const reasons: string[] = [];

    if (preferences.category !== "all" && space.category === preferences.category) {
        score += 2;
        reasons.push("Preferred space type +2");
    }

    for (const amenity of preferences.amenities) {
        if (space.amenities.includes(amenity)) {
            score += 1;
            reasons.push(`${amenity.replaceAll("-", " ")} +1`);
        }
    }

    if (space.verifiedAt) {
        score += 1;
        reasons.push("Source checked +1");
    }

    return { space, score, reasons };
}

export function rankSpaces(spaces: StudySpace[], preferences: ProfilePreferences): ScoredSpace[] {
    return spaces
        .map((space) => scoreSpace(space, preferences))
        .sort((left, right) => right.score - left.score || left.space.name.localeCompare(right.space.name) || left.space.id.localeCompare(right.space.id));
}
