export async function verifyCredentials(username: string, pin: string) {
  const result = await window.api.authenticate(username.trim(), pin);
  return result;
}