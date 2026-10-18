from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()


class UserSummarySerializer(serializers.ModelSerializer):
    """Représentation courte d'un utilisateur (propriétaire d'un voyage, participant)."""

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name"]
        read_only_fields = fields


class UserSerializer(serializers.ModelSerializer):
    """Profil de l'utilisateur connecté."""

    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "date_joined"]
        read_only_fields = fields


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True, style={"input_type": "password"}, trim_whitespace=False
    )

    class Meta:
        model = User
        fields = ["id", "username", "email", "password", "first_name", "last_name"]
        read_only_fields = ["id"]
        extra_kwargs = {"email": {"required": True, "allow_blank": False}}

    def validate_email(self, value):
        email = value.strip().lower()
        # Même règle que la contrainte accounts_user_email_ci_unique, mais en 400 lisible.
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError("Un utilisateur avec ce courriel existe déjà.")
        return email

    def validate(self, attrs):
        # Les validateurs de AUTH_PASSWORD_VALIDATORS comparent le mot de passe
        # au nom d'utilisateur et au courriel : on leur passe un utilisateur non enregistré.
        candidate = User(**{k: v for k, v in attrs.items() if k != "password"})
        try:
            validate_password(attrs["password"], user=candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({"password": list(exc.messages)}) from exc
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        return User.objects.create_user(password=password, **validated_data)


class TokenPairSerializer(serializers.Serializer):
    """Paire de jetons renvoyée après inscription ou connexion."""

    access = serializers.CharField(read_only=True)
    refresh = serializers.CharField(read_only=True)


class RegisterResponseSerializer(serializers.Serializer):
    user = UserSerializer(read_only=True)
    tokens = TokenPairSerializer(read_only=True)


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField(write_only=True)

    default_error_messages = {
        "bad_token": "Jeton de rafraîchissement invalide, expiré ou déjà révoqué.",
        "not_owner": "Ce jeton de rafraîchissement n'appartient pas à l'utilisateur connecté.",
    }

    def validate_refresh(self, value):
        try:
            token = RefreshToken(value)
        except TokenError:
            self.fail("bad_token")
        user = self.context["request"].user
        # Interdit de révoquer la session d'un autre utilisateur avec un jeton volé.
        if str(token.get("user_id")) != str(user.pk):
            self.fail("not_owner")
        return token

    def save(self, **kwargs):
        self.validated_data["refresh"].blacklist()
