-- Run as the migration owner after schema migrations, in each database.
BEGIN;
GRANT USAGE ON SCHEMA public TO studyspace_app, studyspace_saved;
REVOKE ALL ON TABLE "Favorite", "AuthSession" FROM PUBLIC, studyspace_app, studyspace_saved;
REVOKE ALL ON TABLE "StudySpace", "Amenity", "StudySpaceAmenity" FROM PUBLIC, studyspace_app, studyspace_saved;
GRANT SELECT ON TABLE "StudySpace", "Amenity", "StudySpaceAmenity" TO studyspace_app, studyspace_saved;
GRANT SELECT, INSERT, DELETE ON TABLE "Favorite", "AuthSession" TO studyspace_saved;
COMMIT;
