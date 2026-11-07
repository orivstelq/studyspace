
import type { StudySpace } from "./types";

export const developmentSpaces = [
    {
        id: "demo-001",
        slug: "the-reading-room",
        name: "The Reading Room",
        description:
            "A fictional quiet reading environment designed for individual focus.",
        category: "library",
        city: "Demo City",
        region: "Demo Region",
        amenities: ["wifi", "outlets", "quiet"],
        source: "development-fixture",
    },
    {
        id: "demo-002",
        slug: "corner-table-cafe",
        name: "Corner Table Café",
        description:
            "A fictional café-style workspace for casual studying and conversation.",
        category: "cafe",
        city: "Demo City",
        region: "Demo Region",
        amenities: ["wifi", "group-friendly"],
        source: "development-fixture",
    },
    {
        id: "demo-003",
        slug: "north-campus-commons",
        name: "North Campus Commons",
        description:
            "A fictional campus study area for collaborative learning.",
        category: "campus",
        city: "Demo City",
        region: "Demo Region",
        amenities: [
            "wifi",
            "outlets",
            "group-friendly",
            "accessible",
        ],
        source: "development-fixture",
    },
    {
        id: "demo-004",
        slug: "the-focus-studio",
        name: "The Focus Studio",
        description:
            "A fictional workspace with dedicated desks for focused work.",
        category: "coworking",
        city: "Demo City",
        region: "Demo Region",
        amenities: ["wifi", "outlets", "quiet", "accessible"],
        source: "development-fixture",
    },
] satisfies StudySpace[];
