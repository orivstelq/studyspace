
import { NextResponse } from "next/server";
import { listPublishedSpaces } from "@/features/discovery/repository";


export async function GET() {
    try {
        const spaces = await listPublishedSpaces();

        return NextResponse.json(
            {
                data: spaces,
                count: spaces.length,
            },
            {
                headers: {
                    "Cache-Control": "no-store",
                },
            },
        );
    } catch (error) {
        console.error(
            "Failed to retrieve study spaces:",
            error instanceof Error ? error.name : "Unknown error",
        );

        return NextResponse.json(
            {
                error: {
                    code: "INTERNAL_ERROR",
                    message: "Unable to retrieve study spaces.",
                },
            },
            { status: 500 },
        );
    }
}
