import { z } from "zod";

// Schémas des formulaires de connexion et d'inscription. Le formulaire (React Hook Form
// avec zodResolver) et la Server Action utilisent le même schéma : l'utilisateur voit
// l'erreur tout de suite, et le serveur revalide quand même, car un appel à une Server
// Action peut être forgé sans passer par le formulaire.

// Django (UnicodeUsernameValidator) accepte ^[\w.@+-]+$, où \w est le \w Unicode de
// Python : lettres, chiffres et « _ ». \p{L} et \p{N} en sont l'équivalent en JavaScript.
const USERNAME_PATTERN = /^[\p{L}\p{N}_.@+-]+$/u;
const NAME_MAX = 150;
const ONLY_DIGITS = /^\d+$/;

// Django enregistre le nom d'utilisateur en forme NFKC (normalize_username). Nous
// envoyons la même forme, pour qu'un « é » tapé en deux caractères (e + accent) passe.
const username = z.string().trim().normalize("NFKC");

export const loginSchema = z.object({
  username: username.min(1, "Entrez votre nom d'utilisateur."),
  // Pas de trim : une espace peut faire partie d'un mot de passe.
  password: z.string().min(1, "Entrez votre mot de passe."),
});

export const registerSchema = z
  .object({
    username: username
      .min(1, "Choisissez un nom d'utilisateur.")
      .max(NAME_MAX, `Le nom d'utilisateur fait ${NAME_MAX} caractères au plus.`)
      .regex(
        USERNAME_PATTERN,
        "Utilisez seulement des lettres, des chiffres et les caractères @ . + - _",
      ),
    email: z
      .string()
      .trim()
      .min(1, "Entrez votre courriel.")
      .max(254, "Le courriel fait 254 caractères au plus.")
      .pipe(z.email("Ce courriel n'est pas valide.")),
    // Les mêmes règles que MinimumLengthValidator et NumericPasswordValidator de Django.
    // Django vérifie aussi les mots de passe trop courants ou trop proches du nom :
    // son message s'affiche alors sous le champ.
    password: z
      .string()
      .min(8, "Le mot de passe doit contenir au moins 8 caractères.")
      .refine(
        (value) => !ONLY_DIGITS.test(value),
        "Le mot de passe ne peut pas contenir seulement des chiffres.",
      ),
    password_confirm: z.string().min(1, "Confirmez le mot de passe."),
    first_name: z.string().trim().max(NAME_MAX, `Le prénom fait ${NAME_MAX} caractères au plus.`),
    last_name: z.string().trim().max(NAME_MAX, `Le nom fait ${NAME_MAX} caractères au plus.`),
  })
  .refine((values) => values.password === values.password_confirm, {
    path: ["password_confirm"],
    error: "Les deux mots de passe ne correspondent pas.",
  });

/** Valeurs saisies dans le formulaire (avant trim). */
export type LoginInput = z.input<typeof loginSchema>;
/** Valeurs validées, envoyées à Django. */
export type LoginValues = z.output<typeof loginSchema>;
export type RegisterInput = z.input<typeof registerSchema>;
export type RegisterValues = z.output<typeof registerSchema>;

export type LoginField = keyof LoginInput;
export type RegisterField = keyof RegisterInput;
