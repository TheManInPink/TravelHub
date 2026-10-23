import graphene
from django.contrib.auth import get_user_model
from graphene_django import DjangoObjectType

from apps.core.graphql import authenticated_user


class UserType(DjangoObjectType):
    """Utilisateur : propriétaire d'un voyage, participant ou utilisateur connecté.

    Liste blanche de champs : ni mot de passe, ni droits (is_staff, is_superuser,
    groupes), ni relations vers les voyages d'autrui. Le courriel n'est visible que
    par son titulaire.
    """

    email = graphene.String(description="Courriel ; null sauf pour l'utilisateur connecté.")

    class Meta:
        model = get_user_model()
        name = "User"
        fields = ["id", "username", "first_name", "last_name", "date_joined"]

    def resolve_email(root, info):
        return root.email if root.pk == info.context.user.pk else None


class Query(graphene.ObjectType):
    # Champs racine nullables : une erreur (not_authenticated…) n'efface que ce champ.
    me = graphene.Field(UserType, description="Utilisateur connecté.")

    def resolve_me(root, info):
        return authenticated_user(info)
