# Listing review

The San Marcos starter dataset was checked against official sources on November 6, 2026. A source check covers the name, address, description, and listed study amenities. It does not establish real-time access or availability.

| Listing | Street address | Study details |
| --- | --- | --- |
| Albert B. Alkek Library | [Texas State Facilities](https://www.facilities.txst.edu/space-management/addresses/sm-campus-addresses.html) | [Quiet study](https://www.library.txst.edu/spaces-and-technology/reserve-a-space/alkek-library-spaces/quietstudy-floors.html) and [group rooms](https://www.library.txst.edu/spaces-and-technology/reserve-a-space/alkek-library-spaces/groupstudy-rooms.html) |
| San Marcos Public Library | [City facilities directory](https://www.sanmarcostx.gov/facilities/facility/details/San-Marcos-Public-Library-58) | [City library study-room policy](https://www.sanmarcostx.gov/598/Library-Policies) |

To add or update a listing:

1. Start with a draft. Confirm each public claim against primary evidence and record the supporting links here. Leave unknown amenities and facts out.
2. Record the public HTTPS source and the date the content was checked. Review venue access and reservation details before publishing. Link to the venue for information that changes frequently.
3. Publish through a reviewed database change using a maintainer credential. Never promote development fixtures. Update the check date only after rechecking the published facts. Archive listings that should no longer be public.

Import the starter data explicitly with `psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f prisma/data/san-marcos.sql`. It skips existing slugs and preserves their records and amenities. This import is separate from schema migrations and integration-test setup.
