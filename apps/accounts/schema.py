import graphene
from django.contrib.auth import get_user_model
from graphene_django import DjangoObjectType

from apps.core.graphql import authenticated_user


class UserType(DjangoObjectType):
    """Un utilisateur (propriétaire d'un voyage, participant ou utilisateur connecté).

    On n'expose que certains champs. Le mot de passe, les droits (is_staff,
    is_superuser, groupes) et les voyages des autres ne sont pas visibles. Le courriel
    n'est montré qu'à son titulaire.
    """

    email = graphene.String(description="Courriel ; null sauf pour l'utilisateur connecté.")

    class Meta:
        model = get_user_model()
        name = "User"
        fields = ["id", "username", "first_name", "last_name", "date_joined"]

    def resolve_email(root, info):
        return root.email if root.pk == info.context.user.pk else None


class Query(graphene.ObjectType):
    # Les champs racine sont nullables. Comme ça, une erreur (not_authenticated par
    # exemple) ne vide que ce champ.
    me = graphene.Field(UserType, description="Utilisateur connecté.")

    def resolve_me(root, info):
        return authenticated_user(info)
