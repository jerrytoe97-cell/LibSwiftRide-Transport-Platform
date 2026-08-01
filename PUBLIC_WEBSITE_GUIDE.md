# LibSwiftRide Public Website Guide

This guide covers the public marketing website in `apps/web`. It does not cover the authenticated passenger, driver, fleet, dispatcher, business, admin, or API applications.

## Local development

From the repository root:

```bash
pnpm --filter @libswiftride/web dev
```

The default local URL is `http://localhost:3000`. If the port is already in use, Vite prints the assigned URL.

## Public routes

| Route | Purpose |
| --- | --- |
| `/` | Homepage, services overview, passenger and driver journeys, safety, Liberia focus, leadership, business, driver recruitment, sample testimonials, and FAQ |
| `/about` | Mission, operating principles, and Liberia-focused company overview |
| `/services` | Passenger, airport, corporate, fleet, scheduled ride, and delivery services |
| `/safety` | Driver verification, trip monitoring, emergency support, vehicle inspection, account protection, and feedback |
| `/business` | Employee transport, business travel, billing, reporting, and transport controls |
| `/drive` | Driver value proposition and three-step application journey |
| `/leadership` | Executive leadership overview |
| `/leadership/jerry-g-toe` | Founder and CEO profile |
| `/leadership/matthew-p-gaye-jr` | Chief Operating Officer profile |
| `/contact` | Rider, driver, business, and safety contact channels |
| `/faq` | Booking, pricing, payments, applications, safety, service areas, business accounts, and support answers |
| `/privacy` | Public privacy policy |
| `/terms` | Public terms of service |

Unknown paths render a branded not-found page with a link back to the homepage.

## Calls to action

- **Book a Ride** uses `VITE_PASSENGER_APP_URL` when configured and otherwise opens the public Contact page with a booking intent.
- **Drive with Us** opens the public driver recruitment page.
- **Become a Driver** and **Driver login** use `VITE_DRIVER_APP_URL` when configured and otherwise open the Contact page with a driver intent.
- **Create a Business Account** uses `VITE_BUSINESS_APP_URL` when configured and otherwise opens the Contact page with a business intent.
- Leadership cards link to the corresponding full executive profiles.
- Header, footer, service, safety, help, privacy, terms, and contact links remain within the public website.

Production application URLs should be supplied through an approved deployment configuration before launch. No production domain or deployment setting is introduced by this website update.

## Leadership photography

The approved executive portraits are displayed across the homepage, leadership overview, and individual profile pages:

- `apps/web/public/images/leadership/jerry-g-toe-ceo.jpg`
- `apps/web/public/images/leadership/matthew-p-gaye-jr-coo.jpg`

Use appropriately licensed, optimized WebP or JPEG files and meaningful alternative text if the images convey information beyond the adjacent names and roles.

## Review checklist

1. Start the public website and open the homepage at desktop width.
2. Confirm the header navigation reaches About, Services, Safety, Business, Drive, and Contact.
3. Confirm both hero calls to action, the business call to action, and the driver recruitment call to action.
4. Open both leadership profile pages and return through their navigation links.
5. Expand every FAQ item and verify keyboard focus remains visible.
6. Review the footer links and confirm Privacy, Terms, FAQ, Contact, and service links resolve.
7. Test all routes listed above by direct URL entry and refresh the page.
8. Test responsive layouts at 1440 px, 1024 px, 768 px, 390 px, and 360 px widths.
9. At mobile width, open and close the menu, then select each navigation item.
10. Confirm content remains usable with keyboard-only navigation and with reduced-motion enabled.
11. Confirm sample testimonials remain explicitly labelled as fictional demonstration content.
12. Confirm the browser console has no runtime errors or failed asset requests.

## Validation commands

Run from the repository root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

For a faster website-only check during development:

```bash
pnpm --filter @libswiftride/web lint
pnpm --filter @libswiftride/web typecheck
pnpm --filter @libswiftride/web test
pnpm --filter @libswiftride/web build
```

The complete repository checks remain the final acceptance gate.
