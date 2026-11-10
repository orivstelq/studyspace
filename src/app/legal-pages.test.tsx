import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "../components/layout/site-footer";
import PrivacyPage, { metadata as privacyMetadata } from "./privacy/page";
import TermsPage, { metadata as termsMetadata } from "./terms/page";

describe("public legal information", () => {
    it("keeps a keyboard-revealed skip link to the main landmark", () => {
        const layout = readFileSync("src/app/layout.tsx", "utf8");

        expect(layout).toContain('href="#main-content"');
        expect(layout).toContain("sr-only focus:not-sr-only");
        expect(layout).toContain("Skip to content");
    });

    it("publishes accessible privacy information without a fake support address", () => {
        const html = renderToStaticMarkup(<PrivacyPage />);

        expect(privacyMetadata.title).toBe("Privacy information");
        expect(html).toContain("<h1");
        expect(html).toContain("Privacy information</h1>");
        expect(html).toContain("Owner review required before public launch");
        expect(html).toContain("does not yet have a published retention schedule or an account-wide deletion workflow");
        expect(html).toContain('id="support"');
        expect(html).toContain('<main id="main-content" class="mx-auto w-full max-w-5xl');
        expect(html).toContain("lg:grid-cols-[13rem_minmax(0,1fr)]");
        expect(html).toContain('<div class="max-w-2xl">');
        expect(html).not.toContain("mailto:");
    });

    it("labels terms as unfinished instead of presenting unresolved decisions as settled", () => {
        const html = renderToStaticMarkup(<TermsPage />);

        expect(termsMetadata.title).toBe("Terms information");
        expect(html).toContain("Terms of use</h1>");
        expect(html).toContain("Not a finalized agreement");
        expect(html).toContain("No placeholder contact is presented as active");
        expect(html).toContain('<main id="main-content" class="mx-auto w-full max-w-5xl');
        expect(html).toContain("lg:grid-cols-[13rem_minmax(0,1fr)]");
        expect(html).toContain('<div class="max-w-2xl">');
        expect(html).not.toContain("mailto:");
    });

    it("links the shared footer to privacy, terms, and the support status", () => {
        const html = renderToStaticMarkup(<SiteFooter />);

        expect(html).toContain('aria-label="Legal and support"');
        expect(html).toContain('href="/privacy"');
        expect(html).toContain('href="/terms"');
        expect(html).toContain('href="/privacy#support"');
    });
});
