// Keep the existing configured administrator and explicitly grant the requested account.
export function isGoogleAdmin(email, configuredEmail) {
  return [configuredEmail, "hungquocnguyen252@gmail.com"].some(
    (allowed) => allowed && allowed.trim().toLowerCase() === email.toLowerCase(),
  );
}
