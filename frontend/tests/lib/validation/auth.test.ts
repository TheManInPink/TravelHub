import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema, type RegisterInput } from "@/lib/validation/auth";

const valid: RegisterInput = {
  username: "alice",
  email: "alice@example.com",
  password: "Voyage-Montreal-2027",
  password_confirm: "Voyage-Montreal-2027",
  first_name: "Alice",
  last_name: "Tremblay",
};

/** Messages d'erreur du champ donné, après validation. */
function errorsFor(input: RegisterInput, field: keyof RegisterInput): string[] {
  const result = registerSchema.safeParse(input);
  if (result.success) {
    return [];
  }
  return result.error.issues.filter((issue) => issue.path[0] === field).map((i) => i.message);
}

describe("loginSchema", () => {
  it("exige le nom d'utilisateur et le mot de passe", () => {
    const result = loginSchema.safeParse({ username: "  ", password: "" });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "Entrez votre nom d'utilisateur.",
      "Entrez votre mot de passe.",
    ]);
  });

  it("retire les espaces autour du nom, mais pas du mot de passe", () => {
    expect(loginSchema.parse({ username: " alice ", password: " secret " })).toEqual({
      username: "alice",
      password: " secret ",
    });
  });
});

describe("registerSchema", () => {
  it("accepte un compte complet", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it("accepte « hélène » et les autres lettres Unicode, comme Django", () => {
    expect(errorsFor({ ...valid, username: "hélène" }, "username")).toEqual([]);
    expect(errorsFor({ ...valid, username: "jean-françois.2027" }, "username")).toEqual([]);
    expect(errorsFor({ ...valid, username: "李雷_@+" }, "username")).toEqual([]);
  });

  it("met « hélène » tapée en deux caractères (e + accent) en forme NFKC", () => {
    const decomposed = "hélène";
    const result = registerSchema.parse({ ...valid, username: decomposed });

    expect(result.username).toBe("hélène");
  });

  it("refuse les espaces, les caractères interdits et plus de 150 caractères", () => {
    expect(errorsFor({ ...valid, username: "alice tremblay" }, "username")).toHaveLength(1);
    expect(errorsFor({ ...valid, username: "alice!" }, "username")).toHaveLength(1);
    expect(errorsFor({ ...valid, username: "a".repeat(151) }, "username")).toEqual([
      "Le nom d'utilisateur fait 150 caractères au plus.",
    ]);
    expect(errorsFor({ ...valid, username: "a".repeat(150) }, "username")).toEqual([]);
  });

  it("vérifie le courriel", () => {
    expect(errorsFor({ ...valid, email: "" }, "email")).toEqual(["Entrez votre courriel."]);
    expect(errorsFor({ ...valid, email: "alice@" }, "email")).toEqual([
      "Ce courriel n'est pas valide.",
    ]);
  });

  it("refuse un mot de passe trop court ou fait seulement de chiffres", () => {
    expect(
      errorsFor({ ...valid, password: "court", password_confirm: "court" }, "password"),
    ).toEqual(["Le mot de passe doit contenir au moins 8 caractères."]);
    expect(
      errorsFor({ ...valid, password: "12345678", password_confirm: "12345678" }, "password"),
    ).toEqual(["Le mot de passe ne peut pas contenir seulement des chiffres."]);
  });

  it("signale une confirmation différente sous le champ de confirmation", () => {
    expect(
      errorsFor({ ...valid, password_confirm: "Autre-mot-de-passe" }, "password_confirm"),
    ).toEqual(["Les deux mots de passe ne correspondent pas."]);
  });

  it("accepte un prénom et un nom vides, mais pas au-delà de 150 caractères", () => {
    expect(registerSchema.safeParse({ ...valid, first_name: "", last_name: "" }).success).toBe(
      true,
    );
    expect(errorsFor({ ...valid, last_name: "x".repeat(151) }, "last_name")).toEqual([
      "Le nom fait 150 caractères au plus.",
    ]);
  });
});
