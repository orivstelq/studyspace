-- Run as the migration owner after schema migrations, in each database.
BEGIN;
GRANT USAGE ON SCHEMA public TO studyspace_app, studyspace_saved;
REVOKE ALL ON TABLE "Favorite", "AuthSession", "UserProfile", "Review", "UserReport", "ModerationAction" FROM PUBLIC, studyspace_app, studyspace_saved;
REVOKE ALL ON TABLE "StudySpace", "Amenity", "StudySpaceAmenity" FROM PUBLIC, studyspace_app, studyspace_saved;
GRANT SELECT ON TABLE "StudySpace", "Amenity", "StudySpaceAmenity" TO studyspace_app, studyspace_saved;
GRANT SELECT ON TABLE "Review" TO studyspace_app;
GRANT SELECT, INSERT, UPDATE ON TABLE "Review", "UserReport" TO studyspace_saved;
GRANT SELECT, INSERT ON TABLE "ModerationAction" TO studyspace_saved;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Favorite", "AuthSession", "UserProfile" TO studyspace_saved;
COMMIT;
