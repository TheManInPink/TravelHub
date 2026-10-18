from django.urls import path

from . import views

app_name = "auth"

urlpatterns = [
    path("register/", views.RegisterView.as_view(), name="register"),
    path("token/", views.TokenObtainView.as_view(), name="token"),
    path("token/refresh/", views.TokenRefreshRotateView.as_view(), name="token-refresh"),
    path("logout/", views.LogoutView.as_view(), name="logout"),
    path("me/", views.MeView.as_view(), name="me"),
]
