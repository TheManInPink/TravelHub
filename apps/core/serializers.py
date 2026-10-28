import copy

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .exceptions import django_error_detail


class ModelCleanMixin:
    """Applique Model.clean() et les contraintes du modèle aux données validées.

    DRF ne connaît pas les règles de clean() (par exemple les dates d'une destination
    qui doivent être dans le voyage) ni les CheckConstraint. Sans ce contrôle, elles
    provoqueraient une IntegrityError à l'enregistrement. Les règles sont testées sur
    une copie, donc l'instance en base ne change pas si la validation échoue.
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
