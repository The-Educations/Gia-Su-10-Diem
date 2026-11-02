# Search indexing and OAuth branding

Public production URLs:

| Purpose | URL |
| --- | --- |
| Application home page | https://giasudiem10.online/ |
| Privacy policy | https://giasudiem10.online/privacy |
| Terms of service | https://giasudiem10.online/terms |
| Sitemap | https://giasudiem10.online/sitemap.xml |
| Robots | https://giasudiem10.online/robots.txt |

In Google Cloud Console, select the project owning the existing OAuth web client, open **Google Auth Platform → Branding**, and enter the home, privacy and terms URLs above. Use `giasudiem10.online` as the authorized domain. Save the branding settings and follow Google's verification steps if requested. These links are public HTTPS pages and require no account. This repository cannot set the Google project’s branding fields during Cloudflare deployment.

The existing OAuth callback remains `https://giasudiem10.online/api/auth/google/callback`. A privacy or terms URL is not an OAuth redirect URI. The app requests only `openid email profile`; its privacy policy describes the implemented Google identity handling, public tutor content, messages, cookies, infrastructure and support-based deletion requests. Maintain the policy when data handling changes. Policy/support contact: `contact@giasudiem10.online`.

In Google Search Console, add and verify the domain property `giasudiem10.online` using Google's DNS TXT record. Submit `https://giasudiem10.online/sitemap.xml`, then inspect the home page and request indexing. Use the live URL inspection/rendered-page test to confirm Google can load the directory and library, whose results are rendered by React from the public API. Indexing and ranking remain Google's decisions.

The sitemap contains the landing page, tutor directory, subject library and the two policy pages. HTML responses include canonical URLs, Vietnamese metadata and share previews before JavaScript executes. App navigation updates those tags. Query filters canonicalize to the directory. Account pages and individual tutor URLs are `noindex`; tutor profile indexing is intentionally deferred until profile-specific metadata and approval-aware sitemap support exist. Unknown app paths return HTTP 404. API responses carry `X-Robots-Tag: noindex, nofollow`. Robots allows crawling so Google can read noindex directives and render the public app; authorization still protects private data.

`npm test` checks metadata classification and generation. Browser tests cover metadata during navigation, public policy links and responsive layouts. Cloudflare runtime and postdeployment checks verify public routes, noindex headers, the sitemap and preview image. The same production artifact, including generated policy pages, is used in browser checks and deployment.
