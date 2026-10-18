import pytest
from django.urls import reverse


@pytest.mark.django_db
def test_admin_lists_users(admin_client):
    response = admin_client.get(reverse("admin:accounts_user_changelist"))
    assert response.status_code == 200


@pytest.mark.django_db
def test_admin_add_user_form_requires_email(admin_client):
    response = admin_client.get(reverse("admin:accounts_user_add"))
    assert response.status_code == 200
    assert 'name="email"' in response.content.decode()
