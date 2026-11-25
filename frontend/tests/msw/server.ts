import { setupServer } from "msw/node";
import { handlers } from "./handlers";
import { supabaseHandlers } from "./supabase";

// Serveur MSW partagé par tous les tests. Il intercepte fetch dans Node : les appels à
// Django et à Supabase Storage.
export const server = setupServer(...handlers, ...supabaseHandlers);
