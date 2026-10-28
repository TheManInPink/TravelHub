from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models.functions import Lower


class User(AbstractUser):
    """Utilisateur de TravelHub, identifié par un nom d'utilisateur et un courriel unique."""

    email = models.EmailField("adresse courriel")

    REQUIRED_FIELDS = ["email"]

    class Meta:
        verbose_name = "utilisateur"
        verbose_name_plural = "utilisateurs"
        ordering = ["username"]
        constraints = [
            # Le courriel est unique sans tenir compte de la casse (Alice@x.com = alice@x.com).
            models.UniqueConstraint(
                Lower("email"),
                name="accounts_user_email_ci_unique",
                violation_error_message="Un utilisateur avec ce courriel existe déjà.",
            ),
        ]

    def __str__(self):
        return self.get_full_name() or self.username

    def clean(self):
        super().clean()
        self.email = self.email.strip().lower()

    def save(self, *args, **kwargs):
        # createsuperuser et create_user n'appellent pas clean(), donc on normalise aussi ici.
        self.email = self.email.strip().lower()
        super().save(*args, **kwargs)
