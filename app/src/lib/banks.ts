import banks from "../../../shared/banks.json";

// One bank list for the app and the server: shared/banks.json. `code` is what VietQR accepts.
export const BANKS: { name: string; code: string }[] = banks;
