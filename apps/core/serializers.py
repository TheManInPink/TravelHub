import copy

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .exceptions import django_error_detail


class ModelCleanMixin:
    """Applique Model.clean() et les contraintes du modèle aux données validées.

    DRF ne connaît ni les règles de clean() (dates d'une destination comprises dans
    le voyage…) ni les CheckConstraint : sans ce contrôle, elles donneraient une
    IntegrityError au moment de l'enregistrement. Les règles sont évaluées sur une
    copie : l'instance en base reste intacte si la validation échoue.
    """

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if self.instance is not None:
            candidate = copy.copy(self.instance)
        else:
            candidate = self.Meta.model()
        for field, value in attrs.items():
            setattr(candidate, field, value)
        try:
            candidate.clean()
            candidate.validate_constraints()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(django_error_detail(exc)) from exc
        return attrs
