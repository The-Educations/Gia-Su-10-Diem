# App motion and tutor review

Routine app pages render immediately. The shared dialog uses the existing Radix focus trap and CSS presence animations: a 6px vertical arrival with opacity over 180ms, and a 120ms exit. It does not tilt, scale or blur text. The backdrop shares the same timing. Reduced motion removes movement and completes the fade immediately.

The previous Animate UI modal defaults applied perspective, a 20-degree tilt and blur to every dialog. Changing only its duration retained that motion. The shared wrapper now uses Radix directly; other Animate UI primitives (sidebar sheets, tabs and disclosures) retain their existing behavior.

Tutor review has a fixed viewport-bounded surface, a scrollable body and persistent header/actions. Opening focuses its heading without scrolling to the inventory. Closing retains the profile through the exit, then returns focus to the invoking row or the admin search when the row has been filtered out. During review requests, dismissal and duplicate actions are disabled; button labels and icon space remain stable. Delivery errors keep the dialog open for retry.

Shared dialogs also restore focus for programmatic open buttons. Buttons and tabs transition only their intended properties, so keyboard focus rings appear immediately. These choices keep the current warm palette, typography and page layouts.

Browser regression checks sample animation frames for stable dimensions and flat, sharp text; cover repeated keyboard opening/closing, delayed email failures, filtered-row focus, shared-dialog focus restoration, and reduced motion at 320, 768, 1024 and 1440px. Existing student, parent, tutor, admin and community journeys remain the broader regression gate.
