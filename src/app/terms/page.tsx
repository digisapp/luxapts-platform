import type { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export const metadata: Metadata = {
  title: "Terms of Service - Staycio",
  description: "The terms that govern your use of Staycio.",
};

const LAST_UPDATED = "July 12, 2026";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Header />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="text-3xl lg:text-4xl font-semibold tracking-tight">
            Terms of Service
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Last updated: {LAST_UPDATED}
          </p>

          <div className="mt-10 space-y-10 text-sm leading-relaxed text-zinc-400 [&_h2]:text-lg [&_h2]:font-medium [&_h2]:text-white [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_p]:mt-3">
            <section>
              <h2>1. Acceptance of terms</h2>
              <p>
                By accessing or using Staycio, you agree to these Terms of
                Service. If you do not agree, do not use the service. You must
                be at least 18 years old to use Staycio.
              </p>
            </section>

            <section>
              <h2>2. The service</h2>
              <p>
                Staycio is an apartment discovery and lead-referral platform.
                We help you find luxury rental listings in major US cities,
                request tours, and connect with buildings, licensed agents,
                and certified tour guides. Staycio is not a party to any lease
                agreement between you and a landlord or building.
              </p>
            </section>

            <section>
              <h2>3. Listings, pricing, and availability</h2>
              <p>
                Listing details, pricing, and availability are collected from
                building websites, partners, and public sources, and change
                frequently. Prices are shown with the date they were captured
                and are not offers to lease. Always confirm current pricing,
                availability, fees, and policies directly with the building
                before applying or signing.
              </p>
            </section>

            <section>
              <h2>4. AI assistants</h2>
              <p>
                Our AI assistants (chat, voice, and video) generate responses
                automatically and may occasionally be inaccurate or
                incomplete. AI responses are informational only and are not
                real-estate, legal, or financial advice.
              </p>
            </section>

            <section>
              <h2>5. Accounts and acceptable use</h2>
              <ul>
                <li>
                  You are responsible for your account credentials and for all
                  activity under your account.
                </li>
                <li>
                  You agree not to misuse the service — including scraping,
                  submitting false tour requests or leads, attempting to
                  bypass security or rate limits, or using the platform to
                  harass others or send spam.
                </li>
                <li>
                  We may suspend or terminate accounts that violate these
                  terms.
                </li>
              </ul>
            </section>

            <section>
              <h2>6. Tour guides and partners</h2>
              <p>
                Certified tour guides (&quot;showers&quot;) are independent contractors,
                not employees of Staycio. Building partners are responsible
                for the accuracy of the inventory they manage. Additional
                agreements govern those relationships.
              </p>
            </section>

            <section>
              <h2>7. Intellectual property</h2>
              <p>
                The Staycio name, design, and software are our property or
                that of our licensors. Listing photos and building content
                belong to their respective owners. You may not copy,
                redistribute, or create derivative works from the service
                without permission.
              </p>
            </section>

            <section>
              <h2>8. Disclaimers and limitation of liability</h2>
              <p>
                The service is provided &quot;as is&quot; without warranties
                of any kind. To the maximum extent permitted by law, Staycio
                is not liable for indirect, incidental, or consequential
                damages, or for decisions you make in reliance on listing
                information or AI responses. Our total liability for any claim
                is limited to $100 or the amount you paid us in the past 12
                months, whichever is greater.
              </p>
            </section>

            <section>
              <h2>9. Changes and contact</h2>
              <p>
                We may update these terms; continued use after changes take
                effect constitutes acceptance. Questions:{" "}
                <a
                  href="mailto:hello@staycio.com"
                  className="text-white underline underline-offset-4 hover:text-zinc-300"
                >
                  hello@staycio.com
                </a>
                .
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
