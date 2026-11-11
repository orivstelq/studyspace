import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "../components/layout/site-footer";
import { publicContact } from "../lib/public-contact";
import PrivacyPage, { metadata as privacyMetadata } from "./privacy/page";
import TermsPage, { metadata as termsMetadata } from "./terms/page";

describe("public legal information", () => {
    it("keeps a keyboard-revealed skip link to the main landmark", () => {
        const layout = readFileSync("src/app/layout.tsx", "utf8");

        expect(layout).toContain('href="#main-content"');
        expect(layout).toContain("sr-only focus:not-sr-only");
        expect(layout).toContain("Skip to content");
    });

    it("publishes the approved privacy and deletion contact", () => {
        const html = renderToStaticMarkup(<PrivacyPage />);

        expect(privacyMetadata.title).toBe("Privacy information");
        expect(html).toContain("<h1");
        expect(html).toContain("Privacy information</h1>");
        expect(html).toContain("Draft—not legal approval");
        expect(html).toContain("people aged 18 or older in the United States");
        expect(html).toContain("does not currently have a technical age- or country-verification control");
        expect(html).toContain("no advertising, product-analytics, payment, or subscription integration");
        expect(html).toContain("repository code for bounded cleanup, but does not yet enforce them through a deployed retention schedule");
        expect(html).toContain("Requests require identity verification and manual review");
        expect(html).toContain("does not yet offer an account-wide deletion workflow");
        expect(html).toContain('id="support"');
        expect(html).toContain(`href="${publicContact.href}"`);
        expect(html).toContain(publicContact.email);
        expect(html).toContain('<main id="main-content" class="mx-auto w-full max-w-5xl');
        expect(html).toContain("lg:grid-cols-[13rem_minmax(0,1fr)]");
        expect(html).toContain('<div class="max-w-2xl">');
        expect(html).not.toContain("No support email has been published");
    });

    it("labels terms as unfinished instead of presenting unresolved decisions as settled", () => {
        const html = renderToStaticMarkup(<TermsPage />);

        expect(termsMetadata.title).toBe("Terms information");
        expect(html).toContain("Terms of use</h1>");
        expect(html).toContain("Not a finalized agreement");
        expect(html).toContain("initial United States audience aged 18 or older");
        expect(html).toContain("does not currently verify age or residence technically");
        expect(html).toContain("no initial monetization");
        expect(html).toContain(`href="${publicContact.href}"`);
        expect(html).toContain(publicContact.email);
        expect(html).toContain('<main id="main-content" class="mx-auto w-full max-w-5xl');
        expect(html).toContain("lg:grid-cols-[13rem_minmax(0,1fr)]");
        expect(html).toContain('<div class="max-w-2xl">');
        expect(html).not.toContain("A public support email and formal notice address have not been selected");
    });

    it("links the shared footer to privacy, terms, and the approved contact", () => {
        const html = renderToStaticMarkup(<SiteFooter />);

        expect(html).toContain('aria-label="Legal and support"');
        expect(html).toContain('href="/privacy"');
        expect(html).toContain('href="/terms"');
        expect(html).toContain(`href="${publicContact.href}"`);
        expect(html).toContain(">Contact</a>");
        expect(html).not.toContain("Support status");
    });
});
