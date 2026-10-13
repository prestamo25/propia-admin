import { CANONICAL_PAIRS } from "@/lib/testOtp";

// Propia's own accounts (Franz 2026-09-24): Franz («Propia Broker»), Pablo,
// Mariana's two accounts and the PROPIA STAFF / test logins. They never win a
// raffle, and a regional viewer (acceso regional, 2026-10-13) never sees them
// as members of their estado.
export const TEAM_ACCOUNT_IDS = [
  "15fef8d4-0384-4d50-89c5-059c93e9003d", // Propia Broker (Franz)
  "fb561d43-ae89-4d96-b045-046edaad2eb3", // Pablo Prestamo
  "71788077-d110-409a-b730-8825cffb603a", // Mariana Figueroa
  "4d4415af-5003-4ff5-ac45-96b5d2422c73", // Mariana Figueroa (2ª cuenta)
  "6334f20b-4414-45ed-b051-268d4acbf85b", // Staff Propia 01
  "2af0bc92-a4ec-4841-a3fa-753fd8b1d0f2", // STAFF 2 PROPIA
  "d8532244-1eba-4a4a-9fc0-e60fcfa65dc2", // PROPIA STAFF 03
  "13258141-17d5-4e52-bf31-4037a894ad54", // PROPIA STAFF 04
  "062964a1-7d32-490f-a259-857179378ff0", // PROPIA STAFF 5
  "8a17d9fa-967b-4bf4-96c6-047242a3569b", // PROPIA STAFF 06
  "9880d781-7270-419a-a024-7acfe64e1122", // Broker Test
];

// The team above plus the permanent dev/App-Review test phones.
export function isTeamAccount(id: string, phone: string | null): boolean {
  return TEAM_ACCOUNT_IDS.includes(id) || (!!phone && CANONICAL_PAIRS.has(phone));
}
