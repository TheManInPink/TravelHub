from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema, inline_serializer
from rest_framework import generics, serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.core.openapi import THROTTLED, UNAUTHORIZED, VALIDATION_ERROR, error_response

from .serializers import (
    LogoutSerializer,
    RegisterResponseSerializer,
    RegisterSerializer,
    TokenPairSerializer,
    UserSerializer,
)

TAG = "Authentification"

EXAMPLE_TOKENS = {"access": "eyJhbGciOiJIUzI1NiIs…", "refresh": "eyJhbGciOiJIUzI1NiIs…"}
INVALID_TOKEN = error_response(
    "Jeton invalide, expiré ou déjà révoqué", "token_not_valid", "Le jeton est invalide ou expiré"
)


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        tags=[TAG],
        summary="Créer un compte",
        description="Crée un utilisateur et renvoie directement une paire de jetons JWT.",
        responses={
            201: RegisterResponseSerializer,
            400: VALIDATION_ERROR,
            429: THROTTLED,
        },
        examples=[
            OpenApiExample(
                "Inscription",
                value={
                    "username": "alice",
                    "email": "alice@example.com",
                    "password": "Voyage-Montreal-2027",
                    "first_name": "Alice",
                    "last_name": "Tremblay",
                },
                request_only=True,
            ),
            OpenApiExample(
                "Compte créé",
                value={
                    "user": {
                        "id": 1,
                        "username": "alice",
                        "email": "alice@example.com",
                        "first_name": "Alice",
                        "last_name": "Tremblay",
                        "date_joined": "2026-10-18T14:00:00-04:00",
                    },
                    "tokens": EXAMPLE_TOKENS,
                },
                response_only=True,
                status_codes=["201"],
            ),
        ],
    )
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        body = {
            "user": UserSerializer(user).data,
            "tokens": {"access": str(refresh.access_token), "refresh": str(refresh)},
        }
        return Response(body, status=status.HTTP_201_CREATED)


@extend_schema(
    tags=[TAG],
    summary="Se connecter (obtenir une paire de jetons)",
    description=(
        "Jeton d'accès valable 15 minutes, jeton de rafraîchissement valable 1 jour. "
        "Collez le jeton `access` dans « Authorize »."
    ),
    request=inline_serializer(
        "TokenObtain",
        fields={"username": serializers.CharField(), "password": serializers.CharField()},
    ),
    responses={
        200: TokenPairSerializer,
        400: VALIDATION_ERROR,
        401: OpenApiResponse(description="Identifiants incorrects ou compte désactivé."),
        429: THROTTLED,
    },
    examples=[
        OpenApiExample(
            "Connexion",
            value={"username": "alice", "password": "Voyage-Montreal-2027"},
            request_only=True,
        ),
        OpenApiExample("Jetons", value=EXAMPLE_TOKENS, response_only=True, status_codes=["200"]),
    ],
)
class TokenObtainView(TokenObtainPairView):
    pass


@extend_schema(
    tags=[TAG],
    summary="Rafraîchir le jeton d'accès",
    description=(
        "Rotation : la réponse contient un nouveau jeton de rafraîchissement, "
        "l'ancien est mis sur liste noire et ne peut plus servir."
    ),
    request=inline_serializer("TokenRefresh", fields={"refresh": serializers.CharField()}),
    responses={200: TokenPairSerializer, 400: VALIDATION_ERROR, 401: INVALID_TOKEN, 429: THROTTLED},
    examples=[
        OpenApiExample(
            "Rafraîchissement", value={"refresh": EXAMPLE_TOKENS["refresh"]}, request_only=True
        ),
    ],
)
class TokenRefreshRotateView(TokenRefreshView):
    pass


class LogoutView(generics.GenericAPIView):
    serializer_class = LogoutSerializer

    @extend_schema(
        tags=[TAG],
        summary="Se déconnecter",
        description=(
            "Met le jeton de rafraîchissement sur liste noire. Le jeton d'accès reste "
            "valable jusqu'à son expiration (15 minutes au plus)."
        ),
        responses={204: None, 400: VALIDATION_ERROR, 401: UNAUTHORIZED, 429: THROTTLED},
        examples=[
            OpenApiExample(
                "Déconnexion", value={"refresh": EXAMPLE_TOKENS["refresh"]}, request_only=True
            ),
        ],
    )
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(generics.RetrieveAPIView):
    serializer_class = UserSerializer

    @extend_schema(
        tags=[TAG],
        summary="Profil de l'utilisateur connecté",
        responses={200: UserSerializer, 401: UNAUTHORIZED, 429: THROTTLED},
    )
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_object(self):
        return self.request.user
