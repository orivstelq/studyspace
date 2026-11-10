BEGIN;

REVOKE SELECT ON TABLE public."Review" FROM studyspace_app;
REVOKE SELECT ("ownerKey", "createdAt", "updatedAt")
    ON TABLE public."Review" FROM studyspace_app;

GRANT SELECT ("id", "studySpaceId", "rating", "body", "status", "publishedAt")
    ON TABLE public."Review" TO studyspace_app;

COMMIT;
