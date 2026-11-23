import { setupServer } from "msw/node";
import { handlers } from "./handlers";

// Serveur MSW partagé par tous les tests. Il intercepte fetch dans Node.
export const server = setupServer(...handlers);
