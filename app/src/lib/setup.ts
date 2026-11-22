// A person may look around before finishing account setup. The choice lasts
// for this browser session; features that need an account ask again.
const KEY = "giasu.setup.later";
export const skipSetup = () => { try { sessionStorage.setItem(KEY, "1"); } catch { /* setup is required instead */ } };
export const setupSkipped = () => { try { return sessionStorage.getItem(KEY) === "1"; } catch { return false; } };
// Pages that work without a finished account.
export const BROWSE = [/^\/tutors(\/|$)/, /^\/subjects/, /^\/community(\/|$)/, /^\/news/, /^\/library/, /^\/settings$/];
