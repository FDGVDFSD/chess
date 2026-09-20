# Chess Arena Compliance Checklist

Last reviewed: September 19, 2026

This checklist tracks product safeguards inspired by a common "20 things to check before launch" list. It is an engineering/product checklist, not a guarantee of legal compliance and not a substitute for advice from a qualified attorney for the places where the service operates.

| # | Check | Chess Arena status |
|---|---|---|
| 1 | Privacy policy | In-app Privacy Policy describes current data handling, providers, deletion, email, age handling, and contact path. |
| 2 | Terms of service | In-app Terms cover eligibility, acceptable use, availability, ratings/moderation, payments, and contact. |
| 3 | Refund policy | In-app Refund Policy states the current app has no paid checkout and requires updated terms before future paid features. |
| 4 | Cookie/storage policy | In-app Cookie & Browser Storage Policy explains essential session/preference storage and current lack of advertising trackers. |
| 5 | Cookie/storage notice | First-use privacy/storage notice is shown and remembered locally. Login/signup also provide an explicit Remember this device choice; unchecked sessions use session storage, while checked sessions persist across browser restarts. If non-essential tracking is added later, implement jurisdiction-appropriate opt-in controls before enabling it. |
| 6 | Form consent | Signup requires explicit 13+ confirmation and agreement to Terms and Privacy Policy. Policy version/acknowledgement metadata is included with new signups. |
| 7 | No unnecessary data | New signup no longer asks for birth year or full date of birth; it uses a 13+ confirmation instead. |
| 8 | Audit third-party SDKs | Core dependencies and service providers are documented in THIRD_PARTY_NOTICES.md. No analytics/advertising SDK is intentionally included in the current core app. |
| 9 | Remove dark patterns | Signup, reset, deletion, and safety actions are presented as direct labeled controls. Avoid deceptive urgency, forced opt-ins, or disguised actions. |
| 10 | Remove hidden fees | Current app has no paid subscriptions or in-app checkout. Terms and Refund Policy say this explicitly. |
| 11 | Remove fake reviews | Current app has no review/testimonial system. Do not add fabricated reviews or ratings. |
| 12 | Remove unsupported claims | Policies avoid claims such as "COPPA compliant" or formal accessibility certification. Security/privacy wording describes implemented controls instead. |
| 13 | Accessibility text | Important icon-only password/modal controls have accessible labels; decorative/adjacent icons should remain non-essential to understanding. |
| 14 | Color contrast | High-contrast dark theme and visible focus styles are used. Formal WCAG conformance has not been certified. |
| 15 | Keyboard navigation | Skip links and global visible focus styles are included; native buttons/inputs are used for primary interaction. |
| 16 | Business/contact details | Current project contact is the dvilrgamerz GitHub account and the in-app Report a Problem flow. Do not invent a legal business name/address. Add verified business details if the project becomes a registered commercial service. |
| 17 | Age handling | New account creation is 13+ and does not claim a parental-consent system. |
| 18 | Unsubscribe in emails | Current app uses transactional auth/account emails and has no marketing mailing list. Add unsubscribe controls before sending marketing email. |
| 19 | Fonts/images/licenses | Core UI uses system fonts and Lucide icons. Third-party package licenses are documented; new assets should be checked before use. |
| 20 | Data deletion request | Signed-in users can permanently delete their account/data from Settings. Privacy Policy points users to that control and to the reporting path. |

## Re-review triggers

Re-review this checklist before adding payments, ads, analytics, marketing email, social login, third-party tracking, user-generated public content, users under 13, a mobile app store release, or service availability in a new jurisdiction.
