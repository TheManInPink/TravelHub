import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError

User = get_user_model()


@pytest.mark.django_db
class TestUserModel:
    def test_custom_user_model_is_active(self):
        assert User._meta.label == "accounts.User"

    def test_create_user_normalizes_email(self):
        user = User.objects.create_user(
            "alice", email="  Alice@Example.COM ", password="pw-Secret-123"
        )
        assert user.email == "alice@example.com"
        assert user.check_password("pw-Secret-123")

    def test_email_unique_case_insensitive_in_database(self):
        User.objects.create_user("alice", email="alice@example.com", password="x")
        with pytest.raises(IntegrityError):
            User.objects.create_user("alice2", email="ALICE@example.com", password="x")

    def test_email_unique_reported_by_validation(self):
        User.objects.create_user("alice", email="alice@example.com", password="x")
        other = User(username="bob", email="Alice@Example.com")
        other.set_password("pw-Secret-123")
        with pytest.raises(ValidationError) as exc:
            other.full_clean()
        assert "Un utilisateur avec ce courriel existe déjà." in str(exc.value)

    def test_str_uses_full_name_then_username(self):
        assert str(User(username="alice")) == "alice"
        assert str(User(username="alice", first_name="Alice", last_name="Martin")) == "Alice Martin"

    def test_create_superuser(self):
        admin = User.objects.create_superuser("admin", email="admin@example.com", password="x")
        assert admin.is_staff and admin.is_superuser
